<!--
Thanks for publishing to aglet-registry. Most of this PR is auto-generated
by `aglet publish` — but please fill the human sections below before review.
-->

## Aglet

- **ID**: <!-- e.g. timer -->
- **Version**: <!-- e.g. 1.2.0 -->
- **What changed since last version** (skip for first release):
  -

## Author affirmation

<!-- Tick every box before review. -->

- [ ] I authored this aglet (AI-assisted is fine; AI-only also fine if disclosed)
- [ ] I own (or have license to) all text, icons, screenshots, and code
- [ ] `manifest.permissions` lists every permission actually used; nothing extra
- [ ] If `net:fetch` is declared, every endpoint is in `manifest.net_allowlist`
- [ ] No tracking / analytics beyond local-only counters
- [ ] No native code, downloadable binaries, or dynamic imports in `scripts.js`
- [ ] This aglet does not impersonate another product or service

## AI authorship disclosure

- [ ] Primarily AI-authored (link to chat / prompt in PR body or `AGENT_NOTES.md`)
- [ ] AI-assisted (human iterated on AI draft)
- [ ] Fully human-written

## Network usage

If `permissions` includes `net:fetch`, list every endpoint:

| URL pattern | Purpose | Data sent | Data received |
|---|---|---|---|

If `net:fetch` is not used, leave blank.

## How to verify (reviewer-facing)

Steps a reviewer can do in 30 seconds to confirm this works as described:

1.
2.
3.

## Permissions usage map

For each permission in `manifest.permissions`, point to where it's used:

| Permission | Used in | Purpose |
|---|---|---|
| | | |

(Reviewer cross-checks Step 3 of [REVIEW_PROCESS.md](../REVIEW_PROCESS.md).)

## Screenshots

<!-- attach 1-3 screenshots if visual UI; not required for headless aglets -->

---

**Checklist for maintainer:**

- [ ] CI green (Validate PR workflow)
- [ ] Step 1 — Identity & licensing
- [ ] Step 3 — Permissions audit
- [ ] Step 4 — Source review (`ui.json` + `scripts.js`)
- [ ] Step 5 — Visual smoke (`aglet install` + run)
- [ ] No conflict of interest
