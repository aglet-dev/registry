# Publishing to aglet-registry

Two things publish here: **aglets** (apps users install) and **plugins**
(shared wasm services aglets depend on). Same CLI, different pack format,
different review path.

## Prerequisites

- `aglet` CLI installed (`zig build` in the aglet repo, or `brew install
  aglet` when that ships).
- `git` and (for the automated flow) `gh` CLI authenticated against GitHub.
- For **aglet**: source (`<id>.json` + `<id>.ui.tsx` + optional `.background.js`
  / `.scripts.js`) that passes `aglet validate <id>.json --json`.
- For **plugin**: `aplugin.json` with `manifest.plugin: true` + `manifest.namespace`
  + `manifest.actions[]` + built `dist/<id>.wasm`. See `PLUGINS.md` for the
  format spec.

## The automated flow

```sh
aglet publish my-app.json
```

What happens, in order:

1. **Validate + pack**: re-runs the install pipeline (TSX preprocess →
   Tailwind extract → manifest + UI validation) and produces a `.aglet`
   tarball in a tmpdir. Computes its sha256.
2. **Clone registry**: clones `https://github.com/aglet-dev/registry`
   into a tmpdir (or your fork if `gh repo fork` returns one).
3. **Write files**: places `aglets/<id>/<version>.aglet` and rewrites
   `aglets/<id>/meta.json` (appends the new version; updates `latest` if newer).
   `aglets/index.json` is NOT touched by the PR — it's regenerated post-merge
   from all `meta.json` by `.github/scripts/build-indexes.ts` (avoids index
   conflicts across concurrent publish PRs).
4. **Commit + push**: branch `publish/<id>-<version>`.
5. **Open PR**: `gh pr create` against `aglet-dev/registry` with a
   templated body (manifest summary, sha256, install command).

### Plugin variant

```sh
aglet publish ./aglet-plugins/image/aplugin.json
```

CLI detects `manifest.plugin === true` and switches to plugin pack path:
- Tarball is `.aplugin` (gzipped tar with `aplugin.json` + `dist/<id>.wasm`)
- Registry destination is `plugins/<id>/<ver>.aplugin`
- `meta.json` shape per PLUGINS.md (includes `namespace`, `actions[]`,
  `wasm_features[]`, `wasm_sha256`, `wasm_size`)
- PR body adds wasm ABI summary + imports list

When CI passes and a maintainer merges, Cloudflare Pages auto-deploys; users
running `aglet install <id>@<version>` immediately get the new version.

## The manual flow

If `gh` isn't available, or you want to inspect the diff before pushing:

```sh
aglet publish my-app.json --dry-run --json > publish-plan.json
```

The JSON has:

```json
{
  "ok": true,
  "data": {
    "app_id": "my-app",
    "version": "1.0.0",
    "sha256": "...",
    "tarball": "/tmp/aglet-publish-XXXX/my-app-1.0.0.aglet",
    "meta_json": { ... full updated meta.json ... },
    "registry_path": "my-app"
  }
}
```

Then by hand:

```sh
git clone https://github.com/aglet-dev/registry
cd aglet-registry
mkdir -p my-app
cp /tmp/aglet-publish-XXXX/my-app-1.0.0.aglet my-app/1.0.0.aglet
# write the meta_json blob to my-app/meta.json
git checkout -b publish/my-app-1.0.0
git add my-app
git commit -m "publish: my-app@1.0.0"
git push -u origin publish/my-app-1.0.0
# open PR via GitHub UI
```

## What CI checks

`.github/workflows/validate-pr.yml` runs on every PR. It will fail if:

- The tarball doesn't extract or `app.json` / `ui.json` is missing.
- The sha256 in `meta.json` doesn't match the file.
- `manifest.id` ≠ the directory name, or `manifest.version` ≠ the filename.
- The version is already present in `versions[]`.
- `meta.json.latest` isn't one of the versions.

When CI is green, a maintainer reviews for trust / scope / quality and merges.

## Updating an existing app

```sh
aglet publish my-app.json    # version 1.0.1 etc.
```

Same flow; the command preserves all existing `versions[]` entries and just
appends. `latest` is recomputed if the new version sorts higher (semver
comparison; if either side isn't semver, the new one wins).

## Yanking a release

There's no CLI flag for this — it's intentionally a manual maintainer task:

1. Edit `aglets/<id>/meta.json` (or `plugins/<id>/meta.json` for plugin
   yanks), set `yanked: true` on the offending version entry.
2. Update `latest` to the most recent non-yanked version.
3. Move the package file to `archive/{aglets,plugins}/<id>/<ver>.<ext>` so
   the audit trail survives but clients get 404 for the original path.
4. PR with reasoning in the body.

Clients respect `yanked: true` by refusing to resolve `latest` to it and
warning loudly on explicit `@<version>` requests.

## Naming rules

`manifest.id` must match `^[a-z][a-z0-9-]{1,62}$`:

- lowercase letters, digits, hyphen
- starts with a letter
- 2-63 chars
- no leading / trailing / consecutive hyphens

The registry is first-come-first-served on names. Cybersquatting policy: a
maintainer may reassign an unused name if a more legitimate publisher
requests it; see [TRUST.md](TRUST.md) (TBD).
