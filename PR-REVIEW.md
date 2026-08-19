# Open PR batch review

Read-only review against `origin/main` at `2ad2cee`; no PR branch was checked out or modified. “Behind” is the number of commits on current `main` absent from the PR head, from GitHub's compare API.

## PR #34 — REQUEST_CHANGES

- **Security:** `src/lib/crossTeamQueue.ts:25` adds `const res = await fetch(apiUrl(`/api/cross-team-queue${serializeQuery(query)}`));`, so its 30-second poll bypasses `apiFetch` and verified operator auth.
- **State/value:** clean but 27 main commits behind and touches rewritten `src/lib/store.ts`; the cross-team queue is still unique and worth rescuing by using `apiFetch`. Correctness also needs attention: the `window.open(file://...)` fallback handles throws but not the normal `null` return.

## PR #46 — REQUEST_CHANGES

- **Security:** `src/components/FleetGrid.tsx:85` adds `const resp = await fetch(apiUrl("/api/send"), {`, bypassing centralized exact-origin authenticated `apiFetch`.
- **State/value:** clean but 19 main commits behind; both `src/App.tsx` and `FleetGrid.tsx` changed since its base. Per-agent broadcast outcomes remain unique and worth a small secure recut.

## PR #52 — REQUEST_CHANGES

- **Security:** `src/components/JarvisVoice.tsx:89` adds `const socket = new WebSocket(fullUrl);` to a user-supplied arbitrary origin; lines 14/188 also persist that endpoint in `localStorage`, which can persist credential-bearing URL userinfo. Microphone blobs are then sent outside the verified/ticketed socket boundary.
- **Conflict/value:** DIRTY conflict is in `src/components/JarvisView.tsx` (the PR edits the stale tab model that still includes ePOS; main removed ePOS and rewired Jarvis HTTP/visibility). It is 17 main commits behind; voice is unique and worth rescuing only after a trusted-origin authentication contract and a current-main recut.

## PR #53 — CLOSE_OBSOLETE

- **Obsolete/security:** main already contains the circuit breaker, health hook/banner, and migrated call sites in stronger form. The stale `src/lib/api.ts:188` permits arbitrary absolute URLs (`const url = path.startsWith("http") ? path : apiUrl(path);`) and line 205 raw-fetches without main's exact-origin `/api/` restriction and verified credential injection.
- **Conflict/value:** DIRTY conflicts span `HoverPreviewCard`, `MiniMonitor`, `MiniPreview`, `OverviewGrid`, `PinLock`, `VSAgentPanel`, `src/lib/api.ts`, and `src/lib/store.ts`; it is 15 main commits behind. Nothing remains worth rebasing.

## PR #55 — REQUEST_CHANGES

- **Security:** `src/components/TerminalView.tsx:301` adds `fetch("/upload/api/file", { method: "POST", body: fd })`, an unauthenticated backend upload outside the centralized exact-origin operator-auth path.
- **State/value:** clean but 15 main commits behind. The mobile terminal/deep-link/voice/attachment/screenshot work is not present on main, so it is not obsolete; retain it but move uploads behind an authenticated `/api/...` boundary (or equivalent exact-origin authenticated helper) and test that boundary.

## Cross-check

Neither review lane found a PR re-adding `arena.html`, `talk.html`, `timemachine.html`, or `shrine.html` to Vite inputs. Apart from PR #52's persisted arbitrary endpoint, no added operator-token storage/query/cookie/log sink was found.
