# Plugin Format Spec

Plugins are **wasm-only** shared services that aglets depend on via
`manifest.requires`. Users never install plugins directly; `aglet install
<aglet>` auto-resolves and pulls plugin dependencies.

This document is the canonical reference for the plugin file layout and
metadata schema in this registry. For host runtime details (wasmtime config,
WASI sandbox surface, fuel/memory limits) see the aglet repo's
`docs/PLUGIN_REGISTRY_ROADMAP.md`.

## Directory layout

Plugins live under `plugins/`, sibling to the `aglets/` namespace:

```
aglet-registry/
  aglets/                      # User-facing namespace
    index.json                 # Aglet catalog (plugins NOT here)
    <aglet-id>/
      meta.json
      <ver>.aglet
  plugins/                     # Infrastructure namespace
    index.json                 # Plugin catalog (for CLI / dev tools)
    <plugin-id>/
      meta.json                # Plugin-specific schema (see below)
      <ver>.aplugin            # gzipped tar; sha256 in meta.json
      <ver>/                   # Optional: assets mirrored for CF Pages
        README.md
        icon.<ext>
```

**`plugins/` is its own namespace** to avoid collision with aglet ids (user
searching "barcode" should see "Barcode Reader" the aglet, not the underlying
`barcode` plugin). `aglets/index.json` stays aglet-only and user-facing;
`plugins/index.json` is a parallel catalog for plugin metadata.

## File extension: `.aplugin`

Gzipped tar with this layout:

```
plugin.json                    # required; at tar root
dist/<plugin-id>.wasm          # required; standalone wasm
README.md                      # optional
LICENSE                        # optional but strongly encouraged
```

Distinct extension from `.aglet` so `aglet publish` and reviewers can
disambiguate by filename. Both are gzipped tar; the tooling only differs in
pack/validate path.

## `plugins/<id>/meta.json` shape

Mirrors aglet `meta.json` with plugin-specific fields:

```json
{
  "id": "image",
  "name": "Image",
  "description": "PNG / JPEG / WebP / BMP convert + decode/encode primitives + resize/crop/rotate/flip transforms.",
  "author": { "name": "agent-rt", "url": "https://github.com/agent-rt" },
  "homepage": "https://aglet.dev/plugins/image",
  "repository": "https://github.com/agent-rt/aglet/tree/main/aglet-plugins/image",
  "license": "MIT",
  "category": "media",
  "keywords": ["image", "convert", "png", "jpeg", "webp"],

  "namespace": "image",
  "actions": [
    {"name": "metadata", "permission": "image:read"},
    {"name": "decode",   "permission": "image:read"},
    {"name": "encode",   "permission": "image:convert"},
    {"name": "process",  "permission": "image:convert"}
  ],
  "backend_kind": "wasm",
  "wasm_features": ["exceptions"],

  "latest": "2.0.0",
  "versions": [
    {
      "version": "2.0.0",
      "file": "2.0.0.aplugin",
      "sha256": "<tarball sha256>",
      "wasm_sha256": "<inner dist/image.wasm sha256>",
      "wasm_size": 570540,
      "published_at": "2026-05-23T13:00:00Z"
    }
  ]
}
```

Plugin-specific fields:

- **`namespace`** (required) — Plugin's bridge namespace (e.g. `image` →
  `image.process(...)`). Must match `plugin.json` `manifest.namespace`. Two
  plugins in registry **cannot share a namespace** (registry-wide uniqueness).
- **`actions[]`** (required) — Subset of `plugin.json` actions with just
  `name` + `permission`, mirroring for fast catalog scan without unpacking
  the tarball. CI verifies it matches the embedded `plugin.json`.
- **`backend_kind`** (required) — Currently always `"wasm"`. Reserved field
  for future (e.g. WIT-component plugins).
- **`wasm_features[]`** (required) — Wasm proposals the .wasm needs at
  runtime (`exceptions`, `bulk-memory`, `simd`, `gc`, etc). Host checks its
  wasmtime supports them; mismatch = install rejected. **Don't list features
  the wasm doesn't actually use** — reviewer verifies.
- **`wasm_sha256`** (required per-version) — sha256 of inner `dist/<id>.wasm`
  byte-by-byte. Lets reviewers compare against locally rebuilt wasm; lets
  clients tamper-detect even if `.aplugin` tarball is re-tarred.
- **`wasm_size`** (required per-version) — Uncompressed wasm bytes. For
  catalog filtering ("plugins under 1MB") + audit ("did this grow 10×?").
- **`yanked`** (optional, per-version) — Same semantics as aglet.

## `plugins/index.json` shape

```json
{
  "generated_at": "2026-05-23T13:00:00Z",
  "plugins": [
    {
      "id": "image",
      "name": "Image",
      "description": "...",
      "namespace": "image",
      "author": { "name": "agent-rt", "url": "..." },
      "category": "media",
      "keywords": ["image", "convert"],
      "backend_kind": "wasm",
      "wasm_features": ["exceptions"],
      "actions_count": 4,
      "latest": "2.0.0",
      "wasm_size": 570540,
      "updated_at": "2026-05-23T13:00:00Z"
    }
  ]
}
```

`aglet publish plugin` upserts the matching plugin entry on every publish.
Clients hit this when listing available plugins (e.g. `aglet plugin info <id>`)
but **never to drive user install flow** — install resolves via aglet
`manifest.requires` directly to `plugins/<id>/meta.json`.

## Resolution

`aglet install <aglet-id>` flow:

1. Fetch `aglets/<aglet-id>/meta.json` → resolve aglet version → fetch `.aglet`
2. Unpack, read `manifest.requires`
3. For each `{plugin, version}` requirement:
   - If `~/.aglet/plugins/<plugin>/<satisfying-ver>/` exists locally, use it
   - Else fetch `plugins/<plugin>/meta.json` → resolve `version` against
     `versions[]` → fetch `<ver>.aplugin` → verify sha256 → unpack to
     `~/.aglet/plugins/<plugin>/<ver>/`
4. Aggregate aglet permissions + plugin permissions → present to user once
5. User approve → write aglet + plugins atomically; reload host

Version resolution: only **latest** (`>=X.Y`) or **exact pin** (`X.Y.Z`)
supported initially. No `^` / `~`. No lockfile.

## URL patterns

```
https://registry.aglet.dev/plugins/<id>/meta.json
https://registry.aglet.dev/plugins/<id>/<ver>.aplugin
https://registry.aglet.dev/plugins/index.json
```

Cloudflare Pages serves all of these as static files. `_headers` already
covers `application/gzip` for `*.aglet`; add identical entry for `*.aplugin`.

## Namespace conflicts

Registry-wide rule: **one plugin owns a namespace**. PRs adding a plugin
whose `manifest.namespace` collides with an existing plugin are rejected.
Names follow the same `^[a-z][a-z0-9-]{1,62}$` rule as aglet ids; `id` and
`namespace` may differ (e.g. id `image-codecs`, namespace `image`) but
**both must be unique** in the registry.

Cybersquatting policy applies the same way as aglet ids (maintainers may
reassign unused names).

## Cross-references

- Aglet repo `docs/PLUGIN_REGISTRY_ROADMAP.md` — host-side runtime spec
- [REVIEW_PROCESS.md](REVIEW_PROCESS.md) — plugin-specific PR checks (Step 7)
- [SECURITY.md](SECURITY.md) — sandbox surface plugins run inside
- [CONTRIBUTING.md](CONTRIBUTING.md) — author publish flow
