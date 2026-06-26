# Review Process

Every merged PR into `main` makes an aglet publicly available via 
`registry.aglet.dev` and the in-Aglet catalog. We treat each merge as 
publication.

## Maintainers

Listed in [MAINTAINERS.md](MAINTAINERS.md). Each maintainer has merge rights.

**Conflict of interest:** a maintainer cannot merge their own aglet's PR.
Another maintainer must approve. This is enforced by GitHub branch protection
("require review from a non-author").

## Review checkpoints

Every PR passes through these. Maintainer comments inline on each.

### Step 1 — Identity & licensing (5 min)

- [ ] `manifest.author` is present and traceable (GitHub handle / email)
- [ ] No name / icon / screenshot infringes on a third-party trademark
- [ ] License declared (`manifest.license`, SPDX); if absent, default = author 
      reserves rights; we won't accept submissions without explicit license 
      for code we redistribute

### Step 2 — Automated CI (passive)

`.github/workflows/validate-pr.yml` runs:

- `aglet validate` — schema, runtime support, permission consistency
- Tarball integrity (sha256 ↔ `meta.json` match)
- `manifest.id` ↔ directory name
- `manifest.version` ↔ filename + semver discipline
- No duplicate versions
- `latest` ∈ `versions[]`
- Bundle size limits: `.aglet` ≤ 256 KB

A red CI ❌ alone is grounds for not merging.

### Step 3 — Permissions audit (10 min)

For every entry in `manifest.permissions`, the reviewer asks:

- Is this strictly necessary for what the aglet claims to do?
- Does the user-visible description (`manifest.description`) honestly mention
  data the permission grants access to?
- For `net:fetch`: is every URL pattern in `manifest.net_allowlist` documented,
  public, and stable?

**Default stance: least privilege.** If an aglet declares `notifications:post`
but never calls `app.notify` in its `scripts.js` / IR, request the author to
drop the permission.

### Step 4 — Source review (15 min)

Maintainer reads the unpacked tarball:

- **`app.json`** — manifest fields; cross-check description ↔ permissions
- **`ui.json`** — declarative IR; look for unexpected `bridge` actions, 
  `net.fetch` calls outside allowlist, suspicious `template` directives
- **`scripts.js`** (if present) — sandboxed JS; scan for:
  - String concatenation that looks like URL exfiltration
  - Base64 / hex blobs (potentially obfuscated code)
  - Loops / cron-style timers consuming notifications quota
- **`background.js`** (if present) — same scan; declared in `manifest.background`

TSX → IR transformation is deterministic and declarative, so visually 
auditing `ui.json` is straightforward. We don't accept submissions where the 
IR is generated from anything other than a TSX source the author shows in 
the PR (so we can re-derive and compare).

### Step 5 — Visual smoke (5 min)

- Apply `aglet install <id>@<version>` locally
- Open with `aglet dev` (apple-runtime)
- Verify the UI matches the screenshots in `meta.json`
- Run the bundled scenarios (if any) via 
  `aglet test aglets/<id>/scenarios/*.scenario.json`

### Step 6 — Plugin-specific checks (15 min, plugin PRs only)

If the PR is for `plugins/<id>/<ver>.aplugin` (not an aglet), additionally
verify:

- **Source code in PR** — `wrapper.cpp` (or equivalent) + `CMakeLists.txt`
  / `build.sh` / language toolchain config. Binary-only PRs **rejected**;
  reviewer must be able to read the source that compiled to the wasm.

- **Reproducible build** — CI rebuilds wasm from source in the PR; resulting
  byte sha256 **must match** `meta.json.versions[N].wasm_sha256`. If
  mismatch, fail (someone tampered the wasm or the build is non-reproducible).

- **Wasm ABI** — `dist/<id>.wasm` exports exactly `alloc`, `free`, `dispatch`,
  `memory`. No extra unexplained exports. Each export type matches the spec
  (alloc: i32→i32; free: i32,i32→ε; dispatch: i32,i32,i32,i32→i64).

- **Wasm imports whitelist** — The host links **only** a small vetted stub
  table; anything the wasm imports outside it fails loud at instantiate.
  The authoritative list is `STUB_TABLE` / `isKnownStub()` in the aglet repo
  `src/host/wasm_runtime.zig` — **that table is the source of truth; if this
  list disagrees, the code wins** (and fix this doc). As of writing, the
  allowed keys are:

  | import key | what it discloses |
  |---|---|
  | `env.emscripten_notify_memory_growth` | nothing (no-op; emscripten leftover) |
  | `env.__syscall_pipe2` | nothing (returns -1; no kernel pipe) |
  | `env.__syscall_poll` | nothing (0 ready; no real fds) |
  | `wasi_snapshot_preview1.fd_close` | nothing (errno 0; no real fd) |
  | `wasi_snapshot_preview1.fd_write` | nothing — **bytes dropped**, only byte-count returned (stdout probe is blocked) |
  | `wasi_snapshot_preview1.fd_read` | nothing (EOF; reads the in-memory buffer it was handed) |
  | `wasi_snapshot_preview1.fd_seek` | nothing (newoffset 0; in-memory seek) |
  | `wasi_snapshot_preview1.random_get` | host CSPRNG bytes (crypto nonces/keygen) |
  | `wasi_snapshot_preview1.clock_time_get` | host wall-clock / monotonic time |
  | `wasi_snapshot_preview1.proc_exit` | nothing — **traps**, never exits the host |

  Notably **absent** (and therefore unlinkable, so an import of them fails at
  instantiate): `path_open` and every other filesystem op, `sock_*`,
  `fd_*data*`, environment/args. No row = no capability.

  **Any other import**: PR comment requests author justify; reviewer
  discusses with maintainers; either added to `STUB_TABLE` + this list, or
  PR rejected. **Sneaking new imports through review is the #1 security
  risk.**

- **`backend.wasi_imports` declared ⊇ wasm's actual imports** — Each key in
  the wasm's import section must be listed in `aplugin.json`
  `backend.wasi_imports`, and every listed key must be in the table above.
  The host links **only the declared subset** (per-plugin allowlist) and an
  undeclared import fails at instantiate — so a lib smuggling in `fd_write`
  can't dissolve into a silent no-op. Verify with `wasm-tools print` that the
  wasm imports nothing beyond what `wasi_imports` declares. (e.g. crypto
  declares exactly `random_get` + `clock_time_get`; archive declares the
  libarchive fd_* + syscall set.)

- **Wasm features matches `meta.json.wasm_features[]`** — Run `wasm-tools
  print` (or eyeball binary); features declared must match what wasm
  actually uses. Author can't claim `wasm_features: []` and ship a wasm
  using `try_table` (would crash on older clients).

- **Wasm size sanity** — `wasm_size` reported in meta.json must match
  actual file size of inner `dist/<id>.wasm`. Sudden jumps from previous
  version (e.g. +5MB) flagged for explanation.

- **Capability inventory** — Each `actions[].permission` in `meta.json`
  must correspond to a real capability in the source. e.g. an action
  declared `permission: "image:convert"` whose source-code path doesn't
  do any image conversion (suspicious side-effect-only) → rejected.

- **No `aglet plugin install` user-facing copy** — Plugin PR descriptions
  must not instruct users to run `aglet plugin install <id>` (no such user
  command). Plugins resolve via aglet `manifest.requires`.

### Step 7 — Approve / Request Changes / Reject

- **Approve** → label `ready-to-merge` → merge → Cloudflare Pages auto-deploys
- **Request Changes** → comment with specific fixes; author iterates
- **Reject** → close PR with `policy-violation` label + link to the rule

## Rejection criteria

Auto-rejected (closed with one of these labels):

| Label | Reason |
|---|---|
| `native-code` | `.dylib`/`.so` in any tarball; `.wasm` in `.aglet` tarball (plugins `.aplugin` allowed) |
| `code-injection` | `eval()`, `new Function()`, `import()` of non-registered modules in `scripts.js` |
| `phishing` | Impersonates another product / service / brand |
| `nsfw` | Adult content without explicit content controls |
| `regulated-advice` | Crypto / financial / medical advice presented as facts |
| `tracking` | Telemetry beyond local-only counters |
| `persistent-modification` | Tries to write outside its sandbox (login items, kernel ext) |
| `anti-features` | Ads, hidden telemetry, ad-injection |
| `over-permissioned` | Requested permissions not used in code |
| `license-violation` | Uses copyrighted code/assets without license |

## Version updates

- An update is a new `.aglet` file with bumped semver in the same `<id>/`
  directory + an entry in `meta.json.versions[]`
- CI verifies version isn't duplicated
- Review goes through Steps 3-6 again; Step 1-2 mostly identical for an update
- Permissions changes (additions) are flagged red — extra scrutiny

## Yanking

If a published version is later found to be harmful / broken:

1. A maintainer (any) opens a PR setting `yanked: true` in the version entry
2. Updates `latest` to most recent non-yanked
3. Optionally deletes the `.aglet` file (clients see 404; can't fetch)
4. PR merges fast-track (24h) with `yank` label
5. Reason logged in [CHANGELOG.md](CHANGELOG.md)

Already-installed aglets are NOT auto-uninstalled. Users see "yanked" badge
in their installed list and a reason; they decide whether to uninstall.

## SLA

| Action | Target |
|---|---|
| Initial ack on new PR | 3 business days |
| Full review (first round) | 7 business days |
| Re-review after author changes | 3 business days |
| Yank merge (security / harm) | 24 hours |

## Public audit trail

This repo's `git log` IS the audit trail.

- Every merge to `main` is a publication event
- All commits are signed (branch protection requires it)
- Force-push is disabled on `main`
- PR conversations are public

(For App Store / Play reviewers: you can verify any aglet's review history
by visiting `https://github.com/agent-rt/aglet-registry/pulls?q=is:pr+<id>`.)

## Reporting concerns

- Security: open a GitHub Security Advisory (private)
- Policy violation in a published aglet: open a regular Issue with label 
  `complaint`; maintainers review within 7 days
- Trademark / DMCA: email maintainers@aglet.dev + open Issue
