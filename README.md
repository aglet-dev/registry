# corelet-registry

Public registry for `corelet` miniapps. Hosted on Cloudflare Pages at
[registry.agentsan.app](https://registry.agentsan.app); served as static files
straight from this repo.

## What lives here

```
<app-id>/
  meta.json               npm-style index + store metadata (see below)
  <version>.corelet       gzipped tarball; `corelet install <id>[@<version>]`
index.json                catalog of all apps (Store one-shot listing)
```

Every miniapp gets a directory keyed by its `manifest.id`. Each tagged version
is a separate `.corelet` file next to a single `meta.json` index. The top-level
`index.json` aggregates all `<id>/meta.json` entries for fast catalog browsing.

Clients read:

- `https://registry.agentsan.app/<id>/meta.json` — single app's versions + metadata
- `https://registry.agentsan.app/<id>/<version>.corelet` — the actual package
- `https://registry.agentsan.app/index.json` — full catalog (Store UI)

### `meta.json` shape

```json
{
  "id": "hello",
  "name": "Hello",
  "description": "A friendly hello",
  "author": { "name": "linguofeng", "url": "https://github.com/linguofeng" },
  "homepage": "https://example.com",
  "repository": "https://github.com/.../hello",
  "license": "MIT",
  "icon": "https://example.com/hello-icon.png",
  "category": "productivity",
  "keywords": ["greeting"],
  "screenshots": [
    { "url": "https://example.com/hello-main.png", "caption": "Main view" }
  ],
  "latest": "1.0.1",
  "versions": [
    { "version": "1.0.0", "file": "1.0.0.corelet", "sha256": "...", "published_at": "..." },
    { "version": "1.0.1", "file": "1.0.1.corelet", "sha256": "...", "published_at": "..." }
  ]
}
```

The top-level **store metadata** fields (`name` through `screenshots`) reflect
the **latest** publish — they overwrite on every new version. `versions[]` is
append-only per artifact. `corelet publish` extracts store fields from the
publisher's `manifest.{...}` and writes them into `meta.json` automatically.

### `index.json` shape

```json
{
  "generated_at": "2026-05-15T03:31:34Z",
  "apps": [
    { "id": "hello", "name": "Hello", "description": "...", "author": ...,
      "homepage": ..., "icon": ..., "category": "productivity",
      "keywords": [...], "latest": "1.0.1", "updated_at": "..." }
  ]
}
```

Rewritten by `corelet publish` on every publish (upsert by `id`).

## Publishing

Two ways. See [CONTRIBUTING.md](CONTRIBUTING.md) for the long version.

### Automated (recommended)

```sh
corelet publish my-app.json        # forks this repo, opens PR via gh CLI
```

Needs `gh` CLI authenticated. The command builds `.corelet`, computes sha256,
writes `<id>/<version>.corelet` + updates `<id>/meta.json`, commits, pushes a
branch on your fork, and opens a PR. CI validates; a maintainer merges; the
package is live within ~30 seconds of merge (Cloudflare Pages auto-deploys).

### Manual

```sh
corelet pack my-app.json -o my-app-1.0.0.corelet
corelet publish my-app.json --dry-run    # prints the meta.json diff + sha256
# Apply the diff to a fork of this repo, commit, open PR manually.
```

## Versioning rules

- `manifest.version` is a free-form string but must be unique per `<id>`.
- `meta.json.latest` should be the most recent semver-comparable version, or
  the most recently published one if not semver.
- Once published, a `<version>.corelet` is **immutable**. Yank/security
  removals require a maintainer to delete the file and add a `yanked: true`
  marker in `meta.json.versions[]`.

## CI validation

Every PR touching `<id>/<version>.corelet` or `<id>/meta.json` is gated by
`.github/workflows/validate-pr.yml`:

1. The `.corelet` extracts cleanly (tar.gz with `app.json` + `ui.json`).
2. sha256 of the file matches the value in `meta.json.versions[].sha256`.
3. `manifest.id == <id>` (the directory) and `manifest.version == <version>`
   (the filename without `.corelet`).
4. The version is new — not already in `versions[]`.
5. `meta.json.latest` exists in `versions[]`.

If any check fails the PR can't merge.

## Hosting

Cloudflare Pages with this repo as source. No build step (static).
`registry.agentsan.app` is mapped via Pages custom domain.

`Content-Type` headers come from Cloudflare's defaults (`.json` → JSON,
`.corelet` → `application/octet-stream`). No `_headers` overrides needed.

## Trust model

This is a curated registry. Maintainers review every PR. A future
self-published tier (homebrew-style "taps") may use a separate index pointing
to GitHub release assets in personal repos; that doesn't exist yet.

## Why these design choices

The architecture is **homebrew distribution × npm metadata**:

- **From homebrew**: PR-against-central-repo workflow, git as the audit log,
  static-file hosting (no application server, no API tokens, no rate
  limits), CI gate as the only quality control. Cheap and durable —
  homebrew-core has been running this way for over a decade.
- **From npm**: the `meta.json` shape (`{latest, versions: [{version,
  sha256, file, ...}]}`) is the same shape npm's registry returns at
  `https://registry.npmjs.org/<pkg>`. Immutable versions, yank rather than
  delete, sha256 per artifact — these are all npm conventions and they're
  good ones.

What we explicitly *don't* take:

- **No semver range resolver** (^/~/x.y). Clients pick `latest` or a precise
  `@<version>`. Easier to audit, no resolver bugs, fewer surprises.
- **No tarball-of-tarballs / shrinkwrap / lockfile**. A miniapp has no deps;
  it's one self-contained `.corelet`.
- **No API endpoint for publishing**. Publishing is `git commit + gh pr
  create`. There's nothing for a CVE-grade vuln to exploit.
