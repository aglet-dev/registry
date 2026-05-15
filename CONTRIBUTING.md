# Publishing to corelet-registry

## Prerequisites

- `corelet` CLI installed (`zig build` in the corelet repo, or `brew install
  corelet` when that ships).
- `git` and (for the automated flow) `gh` CLI authenticated against GitHub.
- A miniapp source (`<id>.json` + `<id>.ui.tsx` + optional `.background.js` /
  `.scripts.js`) that passes `corelet validate <id>.json --json`.

## The automated flow

```sh
corelet publish my-app.json
```

What happens, in order:

1. **Validate + pack**: re-runs the install pipeline (TSX preprocess →
   Tailwind extract → manifest + UI validation) and produces a `.corelet`
   tarball in a tmpdir. Computes its sha256.
2. **Clone registry**: clones `https://github.com/agent-rt/corelet-registry`
   into a tmpdir (or your fork if `gh repo fork` returns one).
3. **Write files**: places `<id>/<version>.corelet` and rewrites
   `<id>/meta.json` (appends the new version; updates `latest` if newer).
4. **Commit + push**: branch `publish/<id>-<version>`.
5. **Open PR**: `gh pr create` against `agent-rt/corelet-registry` with a
   templated body (manifest summary, sha256, install command).

When CI passes and a maintainer merges, Cloudflare Pages auto-deploys; users
running `corelet install <id>@<version>` immediately get the new version.

## The manual flow

If `gh` isn't available, or you want to inspect the diff before pushing:

```sh
corelet publish my-app.json --dry-run --json > publish-plan.json
```

The JSON has:

```json
{
  "ok": true,
  "data": {
    "app_id": "my-app",
    "version": "1.0.0",
    "sha256": "...",
    "tarball": "/tmp/corelet-publish-XXXX/my-app-1.0.0.corelet",
    "meta_json": { ... full updated meta.json ... },
    "registry_path": "my-app"
  }
}
```

Then by hand:

```sh
git clone https://github.com/agent-rt/corelet-registry
cd corelet-registry
mkdir -p my-app
cp /tmp/corelet-publish-XXXX/my-app-1.0.0.corelet my-app/1.0.0.corelet
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
corelet publish my-app.json    # version 1.0.1 etc.
```

Same flow; the command preserves all existing `versions[]` entries and just
appends. `latest` is recomputed if the new version sorts higher (semver
comparison; if either side isn't semver, the new one wins).

## Yanking a release

There's no CLI flag for this — it's intentionally a manual maintainer task:

1. Edit `<id>/meta.json`, set `yanked: true` on the offending version entry.
2. Update `latest` to the most recent non-yanked version.
3. Optionally delete the `.corelet` file itself (clients will get 404; the
   metadata entry stays for audit).
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
