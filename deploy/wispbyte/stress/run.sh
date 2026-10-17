#!/usr/bin/env bash
# Dukaan.AI — rigorous stress + soak test.
#
# Reproduces the production posture locally and measures it:
#   browser ── same origin ──> SPA  +  /api,/events reverse-proxy ──> bot (Baileys)
# The proxy stands in for the Vercel rewrite, so the bot is tested through the
# same hop and the same root-absolute URLs the browser will use in production.
#
#   ./deploy/wispbyte/stress/run.sh                 # burst + 5-client soak (60s)
#   CLIENTS=25 SOAK_S=600 BURST_TOTAL=20000 ./deploy/wispbyte/stress/run.sh
#
# Safety: the bot runs against a THROWAWAY store + auth dir and with every live
# credential blanked, so it never reads or writes your real shop data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

BOT_PORT="${BOT_PORT:-5101}"
PROXY_PORT="${PROXY_PORT:-4180}"
CLIENTS="${CLIENTS:-5}"
SOAK_S="${SOAK_S:-60}"
BURST_TOTAL="${BURST_TOTAL:-3000}"
BURST_CONC="${BURST_CONC:-50}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dukan-stress.XXXXXX")"
BOT_PID=""
PROXY_PID=""
SAMPLER_PID=""
cleanup() {
  for p in "$SAMPLER_PID" "$PROXY_PID" "$BOT_PID"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null || true
  done
}
trap cleanup EXIT

echo "== Dukaan.AI stress test =="
echo "   workspace : $TMP"
echo "   clients   : $CLIENTS   soak: ${SOAK_S}s   burst: ${BURST_TOTAL} @ ${BURST_CONC}"

# ── 1. the exact artifact Vercel serves ──────────────────────────────────────
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run build >"$TMP/build.log" 2>&1 || { echo "!! build failed:"; tail -20 "$TMP/build.log"; exit 1; }
echo "   dist/     : $(du -sh dist | cut -f1)"

# ── 2. bot, hermetically (throwaway store, no live creds) ────────────────────
PORT="$BOT_PORT" \
AUTH_DIR="$TMP/auth" \
DUKAN_ORDERS_FILE="$TMP/orders.json" \
DUKAN_CATALOG_FILE="$TMP/catalog.json" \
SUPABASE_URL= SUPABASE_SERVICE_KEY= GROQ_API_KEY= OPENROUTER_API_KEY= LLM_BASE_URL= \
DUKAN_DEFAULT_OWNER_ID=stress-owner \
node "$ROOT/whatsapp/server.js" >"$TMP/bot.log" 2>&1 &
BOT_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$BOT_PORT/api/status" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
if [ "$ready" != 1 ]; then
  echo "!! bot never became ready; last 30 log lines:"; tail -30 "$TMP/bot.log"; exit 1
fi
echo "   bot       : pid $BOT_PID on :$BOT_PORT"

# ── 3. the same-origin proxy (Vercel rewrite stand-in) ───────────────────────
BOT_URL="http://127.0.0.1:$BOT_PORT" PROXY_PORT="$PROXY_PORT" \
  node "$ROOT/deploy/wispbyte/stress/proxy.mjs" >"$TMP/proxy.log" 2>&1 &
PROXY_PID=$!
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PROXY_PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
echo "   proxy     : pid $PROXY_PID on :$PROXY_PORT"

# ── 4. sample the bot's RSS for the whole run (the 512 MiB question) ─────────
: > "$TMP/rss.txt"
( while kill -0 "$BOT_PID" 2>/dev/null && [ ! -f "$TMP/stop-sampler" ]; do
    ps -o rss= -p "$BOT_PID" 2>/dev/null | tr -d ' ' >> "$TMP/rss.txt" || true
    sleep 3
  done ) &
SAMPLER_PID=$!

# ── 5. drive it ─────────────────────────────────────────────────────────────
set +e
BASE="http://127.0.0.1:$PROXY_PORT" CLIENTS="$CLIENTS" SOAK_S="$SOAK_S" \
  BURST_TOTAL="$BURST_TOTAL" BURST_CONC="$BURST_CONC" \
  node "$ROOT/deploy/wispbyte/stress/load.mjs" | tee "$TMP/load.out"
LOAD_RC=${PIPESTATUS[0]}
set -e

sleep 1
touch "$TMP/stop-sampler"     # let the sampler exit on its own — no SIGTERM noise
wait "$SAMPLER_PID" 2>/dev/null || true

# ── 6. report ───────────────────────────────────────────────────────────────
awk 'NF{ if (min=="" || $1<min) min=$1; if ($1>max) max=$1; last=$1 } END {
  if (min!="") printf "   bot RSS   : first %.0f MB  peak %.0f MB  last %.0f MB  (%.0f%% of 512 MiB)\n", min/1024, max/1024, last/1024, max/1024/512*100
}' "$TMP/rss.txt"
echo "   dist size : $(du -sh dist | cut -f1)   whatsapp deps: $(du -sh whatsapp/node_modules 2>/dev/null | cut -f1 || echo n/a)"

if [ "$LOAD_RC" = 0 ]; then echo "✅ STRESS PASS"; else echo "❌ STRESS FAIL (see $TMP/load.out)"; fi
exit "$LOAD_RC"
