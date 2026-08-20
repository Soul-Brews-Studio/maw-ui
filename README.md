# maw-ui

The living lens of the oracle mesh. Federation visualization + fleet dashboard for [maw-js](https://github.com/Soul-Brews-Studio/maw-js).

## Quick Start

```sh
# Option A: Install packed dist (Shape A — serves on maw-js :3456)
maw ui --install

# Option B: Dev mode (vite HMR on :5173, proxy to maw-js :3456)
maw ui --dev

# Option C: Hosted
# https://god.buildwithoracle.com/federation_2d
# (pick the backend from the Config page — ?host= was removed, see Backend compatibility)
```

## What's Inside

| View | Route | What it shows |
|------|-------|---------------|
| Federation 2D | `federation_2d.html` | Canvas force-graph of all nodes + agents, live message trails, deep ocean theme |
| Federation 3D | `federation.html` | Three.js immersive view with bloom + particle effects |
| Federation List | `#federation` | Oracle list grouped by node, peer latency, reachability dots |
| Office | `index.html` | Agent grid — status, PTY terminals, WebSocket feed |
| Fleet | `fleet.html` | Fleet-wide view — all sessions across all nodes |
| Dashboard | `dashboard.html` | Overview metrics + agent status |
| Terminal | `terminal.html` | Full xterm.js terminal per agent |
| Mission | `mission.html` | Mission control — active tasks + progress |
| Chat | `chat.html` | Cross-agent messaging |
| Config | `config.html` | Fleet configuration viewer |
| Inbox | `inbox.html` | Oracle inbox — messages + handoffs |
| Workspace | `workspace.html` | Multi-agent workspace with send/action |

## Backend compatibility (maw-rs versions)

**Short answer: build with `VITE_OPEN_MODE=1` and it works against every version.**

maw-rs `v26.8.18` changed how browsers connect. Browsers always send an `Origin` header, and from
that version every Origin-bearing WebSocket upgrade must carry a one-use ticket — which requires an
operator token on the daemon. HTTP is unaffected, so a mismatch fails in a confusing way: the page
loads, shows a LIVE badge and correct agent counts, and never populates.

| maw serve version | browser WebSocket | what you need |
|---|---|---|
| **< v26.8.18** | accepted unauthenticated | nothing — just works |
| **>= v26.8.18**, no token configured | **refused** (401) | set a token, or run an older daemon |
| **>= v26.8.18**, token configured | accepted with a ticket | enter the operator token when prompted |

### Build modes

```sh
npm run build                    # gated: prompts for the operator token at startup
VITE_OPEN_MODE=1 npm run build   # open: no startup gate, prompts only if the backend refuses
```

`VITE_OPEN_MODE` is a **build-time** flag — Vite statically replaces it, so the gate is compiled
out entirely rather than toggled at runtime. It is never a runtime or server-reported signal: a
server must never be able to talk the client out of authenticating.

The open build is the compatible choice. Against an old daemon it never prompts; against a
token-required daemon it detects the refusal, explains it, and offers an inline token field that
reconnects on success — no rebuild, no reload.

### Configuring a token on the daemon

```jsonc
// ~/.config/maw/maw.config.<weight>.json
{ "serve": { "token": "op_…" } }        // persists across restarts
```

```sh
MAW_SERVE_TOKEN="op_…" maw serve --port 3461   # or per-run via env
```

### If the UI is served from a non-loopback origin

maw-rs hardcodes an allowlist of exactly one remote origin (`god.buildwithoracle.com`) plus any
loopback origin. Anything else is refused with `403 origin-not-allowed` **before** auth is even
considered. Add your own:

```sh
MAW_SERVE_ALLOWED_ORIGINS="https://your-ui.example" maw serve --port 3461
```

### Known upstream issues

| issue | effect |
|---|---|
| [maw-rs#953](https://github.com/Soul-Brews-Studio/maw-rs/issues/953) | loopback origins (e.g. `vite dev`) still need a ticket — blocks local browser development |
| [maw-rs#955](https://github.com/Soul-Brews-Studio/maw-rs/issues/955) | startup banner reports `auth: open` while refusing every browser client |

> `maw update` follows the **alpha** channel by default, so a routine update can move a daemon
> across the v26.8.18 boundary without that being an explicit decision. The UI now names the cause
> when that happens rather than failing silently.


## Architecture

- **State**: Zustand stores — agent status, terminal previews, fleet prefs
- **Data**: WebSocket feed from maw-js backend (`:3456`) — real-time, no polling
- **Backend selection**: chosen in-app (Config page / operator gate) and stored locally.
  The old `?host=` query param was **removed** — a link could otherwise choose where your
  operator token was sent (credential exfiltration, maw-ui #111)
- **Build**: Vite multi-page — each `.html` is a standalone entry point

## Client Helpers (`src/lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | Backend origin resolution, `apiFetch` (exact-origin + circuit breaker), `openWs()` / `mintWsTicket()` |
| `capturePoller.ts` | One shared `/api/capture` scheduler for all consumers — dedupes, backs off, pauses on hidden tab |
| `peerExecClient.ts` | Browser client for `POST /api/peer/exec` (signed command relay) |
| `peerProxyClient.ts` | Browser client for `POST /api/proxy` (REST relay for HTTP-LAN peers) |
| `peerConnection.ts` | Classify peer connectivity: same-origin / direct / mixed-content-blocked / invalid |
| `peerConnectionBanner.ts` | Derive UI error banner from peer classification |

## Deploy

### Shape A — packed serve (recommended)

```sh
maw ui --install          # downloads dist from GitHub Releases → ~/.maw/ui/dist/
                          # maw-js serves it alongside /api on :3456
                          # one port, one process, zero config
```

### Cloudflare Workers

```sh
npx wrangler deploy --config wrangler.god.json    # → god.buildwithoracle.com
```

### Dev

```sh
npm install
npm run dev               # vite on :5173, proxy /api + /ws → localhost:3456
```

## CI

- **Build**: every PR + push to main/alpha (`build.yml`)
- **Release**: auto-creates GitHub Release with `maw-ui-dist.tar.gz` on `v*` tag push

## License

[BUSL-1.1](LICENSE) — Nat Weerawan (ณัฐ วีระวรรณ์)
