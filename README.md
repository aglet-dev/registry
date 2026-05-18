# aglet-registry

Public registry for **agentlets** — small declarative tools that run inside
[Aglet](https://github.com/agent-rt/aglet). Each agentlet is AI-authored
or AI-assisted, and reviewed by a human maintainer via public GitHub pull
request before publication.

Hosted on Cloudflare Pages at [registry.aglet.dev](https://registry.aglet.dev);
served as static files straight from this repo.

## Terminology

- **Aglet** — the host application users install (macOS / iOS / Android / web)
- **Agentlet** — an individual tool that runs inside Aglet; AI-built, sandboxed,
  curated via this registry
- **Catalog** — the in-Aglet browseable list of agentlets, sourced from
  `index.json` in this repo

(Inside Aglet source code the unit is still called `miniapp` for historical
reasons. Public-facing material — App Store, website, docs — uses `agentlet`.)

## Governance

- [REVIEW_PROCESS.md](REVIEW_PROCESS.md) — how PRs are reviewed before merge
- [SECURITY.md](SECURITY.md) — sandbox / trust model for every published agentlet
- [MAINTAINERS.md](MAINTAINERS.md) — who has merge rights, conflict-of-interest policy
- [CONTRIBUTING.md](CONTRIBUTING.md) — author flow (`aglet publish`)
- [CHANGELOG.md](CHANGELOG.md) — registry-level events (yanks, policy changes)

## What lives here

```
<app-id>/
  meta.json                  npm-style index + store metadata (see below)
  <version>.aglet          gzipped tarball; `aglet install <id>[@<version>]`
  <version>/
    icon.<ext>               bundled icon, if manifest used a relative path
    screenshots/<N>.<ext>    bundled screenshots
index.json                   catalog of all apps (Store one-shot listing)
```

`aglet publish` dual-writes bundled assets: they're inside the `.aglet`
tarball (sha256 covers them) **and** mirrored as plain files under
`<id>/<version>/` so Cloudflare Pages serves them directly without unpacking.
External http(s):// URLs in manifests are passed through unchanged.

Every agentlet gets a directory keyed by its `manifest.id`. Each tagged version
is a separate `.aglet` file next to a single `meta.json` index. The top-level
`index.json` aggregates all `<id>/meta.json` entries for fast catalog browsing.

Clients read:

- `https://registry.aglet.dev/<id>/meta.json` — single app's versions + metadata
- `https://registry.aglet.dev/<id>/<version>.aglet` — the actual package
- `https://registry.aglet.dev/index.json` — full catalog (Store UI)

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
    { "version": "1.0.0", "file": "1.0.0.aglet", "sha256": "...", "published_at": "..." },
    { "version": "1.0.1", "file": "1.0.1.aglet", "sha256": "...", "published_at": "..." }
  ]
}
```

The top-level **store metadata** fields (`name` through `screenshots`) reflect
the **latest** publish — they overwrite on every new version. `versions[]` is
append-only per artifact. `aglet publish` extracts store fields from the
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

Rewritten by `aglet publish` on every publish (upsert by `id`).

## Publishing

Two ways. See [CONTRIBUTING.md](CONTRIBUTING.md) for the long version.

### Automated (recommended)

```sh
aglet publish my-app.json        # forks this repo, opens PR via gh CLI
```

Needs `gh` CLI authenticated. The command builds `.aglet`, computes sha256,
writes `<id>/<version>.aglet` + updates `<id>/meta.json`, commits, pushes a
branch on your fork, and opens a PR. CI validates; a maintainer merges; the
package is live within ~30 seconds of merge (Cloudflare Pages auto-deploys).

### Manual

```sh
aglet pack my-app.json -o my-app-1.0.0.aglet
aglet publish my-app.json --dry-run    # prints the meta.json diff + sha256
# Apply the diff to a fork of this repo, commit, open PR manually.
```

## Versioning rules

- `manifest.version` is a free-form string but must be unique per `<id>`.
- `meta.json.latest` should be the most recent semver-comparable version, or
  the most recently published one if not semver.
- Once published, a `<version>.aglet` is **immutable**. Yank/security
  removals require a maintainer to delete the file and add a `yanked: true`
  marker in `meta.json.versions[]`.

## CI validation

Every PR touching `<id>/<version>.aglet` or `<id>/meta.json` is gated by
`.github/workflows/validate-pr.yml`:

1. The `.aglet` extracts cleanly (tar.gz with `app.json` + `ui.json`).
2. sha256 of the file matches the value in `meta.json.versions[].sha256`.
3. `manifest.id == <id>` (the directory) and `manifest.version == <version>`
   (the filename without `.aglet`).
4. The version is new — not already in `versions[]`.
5. `meta.json.latest` exists in `versions[]`.

If any check fails the PR can't merge.

## Hosting

Cloudflare Pages with this repo as source. No build step (static).
`registry.aglet.dev` is mapped via Pages custom domain.

`Content-Type` headers come from Cloudflare's defaults (`.json` → JSON,
`.aglet` → `application/octet-stream`). No `_headers` overrides needed.

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
- **No tarball-of-tarballs / shrinkwrap / lockfile**. An agentlet has no deps;
  it's one self-contained `.aglet`.
- **No API endpoint for publishing**. Publishing is `git commit + gh pr
  create`. There's nothing for a CVE-grade vuln to exploit.
