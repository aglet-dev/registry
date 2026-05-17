# Review Process

Every merged PR into `main` makes an agentlet publicly available via 
`registry.agentsan.app` and the in-Corelet catalog. We treat each merge as 
publication.

## Maintainers

Listed in [MAINTAINERS.md](MAINTAINERS.md). Each maintainer has merge rights.

**Conflict of interest:** a maintainer cannot merge their own agentlet's PR.
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

- `corelet validate` — schema, runtime support, permission consistency
- Tarball integrity (sha256 ↔ `meta.json` match)
- `manifest.id` ↔ directory name
- `manifest.version` ↔ filename + semver discipline
- No duplicate versions
- `latest` ∈ `versions[]`
- Bundle size limits: `.corelet` ≤ 256 KB

A red CI ❌ alone is grounds for not merging.

### Step 3 — Permissions audit (10 min)

For every entry in `manifest.permissions`, the reviewer asks:

- Is this strictly necessary for what the agentlet claims to do?
- Does the user-visible description (`manifest.description`) honestly mention
  data the permission grants access to?
- For `net:fetch`: is every URL pattern in `manifest.net_allowlist` documented,
  public, and stable?

**Default stance: least privilege.** If an agentlet declares `notifications:post`
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

- Apply `corelet install <id>@<version>` locally
- Open with `corelet dev` (apple-runtime)
- Verify the UI matches the screenshots in `meta.json`
- Run the bundled scenarios (if any) via 
  `corelet test agentlets/<id>/scenarios/*.scenario.json`

### Step 6 — Approve / Request Changes / Reject

- **Approve** → label `ready-to-merge` → merge → Cloudflare Pages auto-deploys
- **Request Changes** → comment with specific fixes; author iterates
- **Reject** → close PR with `policy-violation` label + link to the rule

## Rejection criteria

Auto-rejected (closed with one of these labels):

| Label | Reason |
|---|---|
| `native-code` | `.dylib`/`.so`/`.wasm` executable code in tarball |
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

- An update is a new `.corelet` file with bumped semver in the same `<id>/`
  directory + an entry in `meta.json.versions[]`
- CI verifies version isn't duplicated
- Review goes through Steps 3-6 again; Step 1-2 mostly identical for an update
- Permissions changes (additions) are flagged red — extra scrutiny

## Yanking

If a published version is later found to be harmful / broken:

1. A maintainer (any) opens a PR setting `yanked: true` in the version entry
2. Updates `latest` to most recent non-yanked
3. Optionally deletes the `.corelet` file (clients see 404; can't fetch)
4. PR merges fast-track (24h) with `yank` label
5. Reason logged in [CHANGELOG.md](CHANGELOG.md)

Already-installed agentlets are NOT auto-uninstalled. Users see "yanked" badge
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

(For App Store / Play reviewers: you can verify any agentlet's review history
by visiting `https://github.com/agent-rt/corelet-registry/pulls?q=is:pr+<id>`.)

## Reporting concerns

- Security: open a GitHub Security Advisory (private)
- Policy violation in a published agentlet: open a regular Issue with label 
  `complaint`; maintainers review within 7 days
- Trademark / DMCA: email maintainers@agentsan.app + open Issue
