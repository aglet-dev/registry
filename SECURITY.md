# Corelet Trust Model

Every agentlet distributed via this registry runs inside three independent 
sandboxes. This document is the canonical reference for what agentlets can 
and cannot do.

## Sandbox 1 — Declarative IR

`<id>.ui.tsx` compiles to a JSON IR (`ui.json`) before pack. At runtime, the 
renderer walks this tree to draw widgets.

- **No code execution paths.** IR is a data structure, not a program.
- **Whitelisted props per component** — validator (single source in 
  `corelet-core/src/spec.zig`) rejects unknown props at install time.
- **Directives** (`{op:"state",path:"/state/x"}`, `{op:"cond",...}`, etc.) are
  evaluated by Corelet's canonical Zig evaluator with no side effects beyond 
  reading session state.

If a directive op isn't in the spec, the package fails validation. There is
no way for an agentlet to introduce new directive semantics.

## Sandbox 2 — QuickJS scripts.js

Optional `scripts.js` runs in an embedded QuickJS interpreter (`libcorelet.a`
on Apple platforms, `libcorelet.wasm` on web).

Available APIs:

- `corelet.bridge(action, params)` — the **only** I/O surface
- `setState(patch)` / `setStateAt(path, value)` — write to session state
- `ctx.scope` — read-only state snapshot at invocation time
- `ctx.dispatch(action, params)` — alias for `corelet.bridge`

Explicitly **NOT** available:

- `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`
- `setTimeout`, `setInterval` (use declarative `manifest.timers` instead)
- DOM (`document`, `window` — even on web; scripts run in isolated context)
- `eval`, `Function()`, dynamic `import()`
- Node.js globals (`require`, `process`, `Buffer`, `fs`)
- Workers, Service Workers, SharedArrayBuffer

QuickJS is sealed at the C level; these globals are not just hidden — they
are not bound. Calling them throws `ReferenceError`.

Each `scripts.<fn>` call gets a **fresh QuickJS Runtime** (no cross-call 
retention except what's persisted to `/state/*` via setState). So even 
malicious code can't accumulate state across invocations.

## Sandbox 3 — Bridge permission gate

Every bridge call (`data.list`, `app.notify`, `net.fetch`, etc.) is checked
against `manifest.permissions` at dispatch time. Default = no permission.

| Permission | What it grants |
|---|---|
| `data:read` | List / get records in **this agentlet's own** collections |
| `data:write` | Create / update / delete records in **own** collections |
| `notifications:post` | Show user notifications via `app.notify` |
| `net:fetch` | HTTP GET to URLs declared in `manifest.net_allowlist[]` |
| `system:tray` | Add / update a menubar tray icon |
| `clipboard:read` / `clipboard:write` | Read / write OS clipboard |

Permissions are presented to the user at install time. They can revoke 
individually after install.

**Data isolation:**

- Each agentlet's records are namespaced by `app_id` in SQLite — no cross-app
  reads or writes
- No shared filesystem outside `~/.corelet/data/<id>/`
- No access to other agentlets' state / form / settings scopes

## Network policy

By default, an agentlet cannot make any outbound network call.

If `manifest.permissions` includes `net:fetch`, the author must also declare:

```json
{
  "permissions": ["net:fetch"],
  "net_allowlist": [
    "https://api.example.com/v1/*",
    "https://news.ycombinator.com/"
  ]
}
```

URL patterns support `*` as a path-component wildcard. Anything not matched
returns 403 at the bridge gate. Reviewers verify the allowlist against actual
code usage in Step 4 of [REVIEW_PROCESS.md](REVIEW_PROCESS.md).

`POST` / `PUT` / `DELETE` and arbitrary headers require the additional 
`net:mutate` permission (rarely granted; flagged red in review).

## What Corelet (the host) itself does on the device

The Corelet desktop / mobile host app:

- Stores agentlet data locally in `~/.corelet/data/`
- Connects to `registry.agentsan.app` only for: catalog fetch, agentlet 
  download (when user clicks install), update check
- Does **NOT** proxy agentlet `net:fetch` calls — each agentlet's network 
  access goes directly to the declared endpoints from the user's machine
- Does **NOT** collect telemetry except opt-in crash reports
- Does **NOT** transmit any agentlet data anywhere

`registry.agentsan.app` is Cloudflare Pages serving plain static files from 
this Git repo. It is HTTPS-only and has no server-side state about who 
installed what.

## Threat model

In scope:

- A malicious agentlet author trying to exfiltrate user data → mitigated by 
  permission gate + net allowlist + review
- A buggy agentlet crashing → isolated to its own QuickJS Runtime
- An agentlet consuming excessive disk → SQLite quota per app (default 10 MB,
  configurable per app)
- Supply chain attack via dependency → agentlets have **no JS dependencies**;
  they're single-file TSX → IR + single-file scripts.js

Out of scope (not Corelet's job to mitigate):

- Compromise of the user's machine → fall back to OS-level defenses
- Compromise of `registry.agentsan.app` → mitigated by sha256 in 
  `meta.json`; Corelet client verifies before install
- Compromise of GitHub → would require auditing recent merges; force-push 
  protection prevents history rewrite

## Reporting security issues

1. Open a GitHub Security Advisory at this repo (private)
2. Or email `security@agentsan.app`
3. We acknowledge within 48h, fix within 7 days for sandbox escapes, longer 
   for less critical issues

## Independent verification

To verify a sandbox claim yourself:

```sh
# Inspect any agentlet's complete source
gh repo clone agent-rt/corelet-registry
cd corelet-registry/<app-id>
tar -xzf <version>.corelet -O ui.json | jq .
tar -xzf <version>.corelet -O scripts.js   # if exists
tar -xzf <version>.corelet -O app.json | jq .permissions
```

Everything an agentlet can do is in those three files. There is no other 
runtime code path.
