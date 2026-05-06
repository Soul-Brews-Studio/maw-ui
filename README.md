# maw-ui

The living lens of the oracle mesh. Federation visualization + fleet dashboard for [maw-js](https://github.com/Soul-Brews-Studio/maw-js).

## Quick Start

```sh
# Option A: Install packed dist (Shape A — serves on maw-js :3456)
maw ui --install

# Option B: Dev mode (vite HMR on :5173, proxy to maw-js :3456)
maw ui --dev

# Option C: Hosted
# https://god.buildwithoracle.com/federation_2d?host=<your-node>
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
| Kaiju Control Tower | `control_tower.html` | Agent Ops + business operations surface for Kaiju AI Office |
| Terminal | `terminal.html` | Full xterm.js terminal per agent |
| Mission | `mission.html` | Mission control — active tasks + progress |
| Chat | `chat.html` | Cross-agent messaging |
| Config | `config.html` | Fleet configuration viewer |
| Inbox | `inbox.html` | Oracle inbox — messages + handoffs |
| Workspace | `workspace.html` | Multi-agent workspace with send/action |

## Architecture

- **State**: Zustand stores — agent status, terminal previews, fleet prefs
- **Data**: WebSocket feed from maw-js backend (`:3456`) — real-time, no polling
- **Routing**: `?host=<peer>` query param points any page at any maw-js node ([drizzle.studio pattern](https://local.drizzle.studio))
- **Build**: Vite multi-page — each `.html` is a standalone entry point

## Client Helpers (`src/lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | `apiUrl()` / `wsUrl()` — centralized `?host=` resolution |
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
