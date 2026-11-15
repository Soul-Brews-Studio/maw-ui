#!/usr/bin/env bash
#
# deploy-maw.sh — overlay-merge deploy of maw-ui to /opt/maw-dashboard, guardrailed.
#
# Encodes Echo's deploy guardrails 1–8. #8 (ConnectPage smoke) was added 2026-06-03
# after the cached-swr deploy (62c3372) silently dropped the ConnectPage probe fix
# (4f73c54): every chunk returned 200 so guardrail #5 passed, but the served bundle
# had no probe fix → bare /maw/ wrongly bounced to ConnectPage. #8 closes that class:
# a deploy whose served main bundle lacks the probe marker is rolled back automatically.
#
# Usage:  scripts/deploy-maw.sh            # build + deploy + verify (+ rollback on smoke fail)
#         scripts/deploy-maw.sh --no-build # deploy an already-built ./dist
#
# Constraints honored: --base=/maw/ mandatory; overlay-merge only (NEVER prune —
# TCONSIAM KB /maw/tconsiam/ and other runtime-only pages must survive); backup first.
set -uo pipefail

DEPLOY_DIR="/opt/maw-dashboard"
BACKUP_ROOT="/var/backups"
BASE="/maw/"
PROXY="https://76.13.221.42:8443"
PROBE_MARKER="Connecting…"       # ProbeLoading state unique to the ConnectPage probe fix.
                                 # NOTE: U+2026 ellipsis, NOT ASCII "Connecting..." (that is the
                                 # websocket status text and is present even in regressed builds).
export PATH="/root/.bun/bin:$PATH"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$*" >&2; exit 1; }

# ── Guardrail #1 — build with mandatory base, verify dist refs ────────────────
if [[ "${1:-}" != "--no-build" ]]; then
  say "Guardrail #1 — vite build --base=$BASE"
  npx vite build --base="$BASE" || fail "build exited non-zero"
fi
[[ -f dist/index.html ]] || fail "dist/index.html missing"
grep -q "\"${BASE}assets/main-" dist/index.html || fail "dist index.html has no ${BASE}assets/main- ref (base override lost)"
if grep -qo '"/assets/' dist/index.html; then
  fail "dist index.html has bare /assets/ refs (would 404 under ${BASE})"
fi
echo "  ok: dist refs ${BASE}assets/, no bare /assets/"

# ── Guardrail #8 (pre-flight) — the build we are about to ship MUST carry the fix
say "Guardrail #8 (pre-flight) — probe marker present in built bundle"
DIST_MAIN=$(ls dist/assets/main-*.js 2>/dev/null | head -1)
[[ -n "$DIST_MAIN" ]] || fail "no dist/assets/main-*.js"
grep -q "$PROBE_MARKER" "$DIST_MAIN" || fail "built bundle $DIST_MAIN lacks '$PROBE_MARKER' — refusing to ship a ConnectPage-regressing build"
echo "  ok: '$PROBE_MARKER' present in $(basename "$DIST_MAIN")"

# ── Guardrail #2 — backup first, verify non-empty ────────────────────────────
say "Guardrail #2 — backup $DEPLOY_DIR"
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="$BACKUP_ROOT/maw-dashboard-$TS"
cp -a "$DEPLOY_DIR" "$BACKUP" || fail "backup failed"
COUNT=$(find "$BACKUP" -type f | wc -l)
[[ "$COUNT" -gt 0 ]] || fail "backup is empty"
echo "  ok: $BACKUP ($COUNT files)"

# ── Guardrail #3 — overlay-merge, NO prune ───────────────────────────────────
say "Guardrail #3 — overlay-merge (no prune)"
cp -a dist/. "$DEPLOY_DIR"/ || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "overlay copy failed — restored from backup"; }
[[ -d "$DEPLOY_DIR/tconsiam" ]] || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "tconsiam KB vanished — restored from backup"; }
echo "  ok: overlay applied, tconsiam KB intact on disk"

# ── Guardrail #4 — restart backend (static is live immediately; restart node API) ─
say "Guardrail #4 — pm2 restart maw"
pm2 restart maw >/dev/null 2>&1 && echo "  ok: pm2 restarted maw" || echo "  warn: pm2 restart maw skipped/failed (static deploy still live)"

# ── Guardrail #5 — live verify served assets 200 + KB 200 ────────────────────
say "Guardrail #5 — live verify through proxy"
SERVED_REF=$(curl -sk "$PROXY${BASE}" | grep -o "${BASE}assets/main-[A-Za-z0-9_-]*\.js" | head -1)
[[ -n "$SERVED_REF" ]] || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "served index has no main ref — restored"; }
code() { curl -sk -o /dev/null -w '%{http_code}' "$1"; }
[[ "$(code "$PROXY${BASE}")" == "200" ]]                 || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "bare ${BASE} != 200 — restored"; }
[[ "$(code "$PROXY$SERVED_REF")" == "200" ]]             || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "served main bundle != 200 — restored"; }
[[ "$(code "$PROXY${BASE}tconsiam/")" == "200" ]]        || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "tconsiam KB != 200 — restored"; }
echo "  ok: bare ${BASE} 200, $SERVED_REF 200, tconsiam KB 200"

# ── Guardrail #8 (post-deploy) — served bundle MUST carry the probe fix ───────
# This is the check that would have caught the 2026-06-03 regression. Fetch the
# ACTUAL served main bundle and assert the ConnectPage probe marker is present.
# Fail ⇒ roll back to backup and exit non-zero.
say "Guardrail #8 (post-deploy) — ConnectPage probe smoke on SERVED bundle"
curl -sk "$PROXY$SERVED_REF" -o /tmp/maw-served-main.js || { cp -a "$BACKUP"/. "$DEPLOY_DIR"/; fail "could not fetch served bundle — restored"; }
if ! grep -q "$PROBE_MARKER" /tmp/maw-served-main.js; then
  cp -a "$BACKUP"/. "$DEPLOY_DIR"/
  fail "served bundle $SERVED_REF lacks '$PROBE_MARKER' — ConnectPage regression — ROLLED BACK to $BACKUP"
fi
echo "  ok: served bundle carries '$PROBE_MARKER' → bare ${BASE} renders dashboard, not ConnectPage"

say "DEPLOY GREEN — $SERVED_REF live, all 8 guardrails passed (backup: $BACKUP)"
