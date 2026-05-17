# Maintainers

Active maintainers with merge rights to `main`:

| GitHub | Role | Time zone | Areas |
|---|---|---|---|
| @linguofeng | Lead | UTC+9 (JST) | Architecture, runtime, registry policy |

(Add yourself via PR.)

## Becoming a maintainer

Open an Issue with title `[maintainer] <your handle>` describing:
- Your background
- Why you want to maintain
- Which area you'd focus on (review, infra, docs, etc.)

Existing maintainers vote (lazy consensus, 7-day window). At least one 
existing maintainer must approve.

## Maintainer responsibilities

- Review PRs per [REVIEW_PROCESS.md](REVIEW_PROCESS.md) SLAs
- Triage Issues, especially `complaint` and `security` labels
- Coordinate yanks for security / harm cases (24h SLA)
- Keep [CHANGELOG.md](CHANGELOG.md) up to date

## Conflict of interest

A maintainer **cannot** merge a PR for a miniapp where:
- They are the `manifest.author` or co-author
- They have a direct financial interest in the miniapp's adoption
- They've been paid by the author for development

Branch protection enforces "review from a non-author required". Use your 
best judgment for the harder cases.

## Removing a maintainer

- Voluntary: open Issue, self-remove via PR
- Involuntary (inactivity > 6 months, policy violation, etc.): 2/3 majority 
  of remaining maintainers; document reason in CHANGELOG

## Security disclosures

All current maintainers must enable 2FA on GitHub. Compromised account is 
grounds for immediate suspension pending investigation.
