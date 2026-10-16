#!/usr/bin/env bash
# Post-deploy acceptance: proves the PUBLIC url is wired end to end.
# Needs no credentials — it only reads what a browser would read.
#
#   ./deploy/wispbyte/verify-live.sh https://dukaan-ai.vercel.app
#
# Checks, in the order the demo depends on them:
#   1. the app shell loads            /
#   2. the proxy reaches the VPS      /api/status
#   3. the catalog endpoint answers   /api/dukan/catalog
#   4. the live-update stream opens   /events   (the new-order chime)
set -uo pipefail

URL="${1:-}"
if [ -z "$URL" ] || [ "${URL#http}" = "$URL" ]; then
  echo "Usage: $0 https://your-app.vercel.app" >&2
  exit 2
fi
URL="${URL%/}"

fail=0
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

chk() {
  local name="$1"; shift
  local code
  code=$(curl -sS -o "$TMP" -w '%{http_code}' "$@" 2>/dev/null) || code=000
  if [ "$code" = "200" ]; then
    printf '  ✅ %-34s %s\n' "$name" "$(head -c 90 "$TMP" | tr -d '\n')"
  else
    printf '  ❌ %-34s HTTP %s\n' "$name" "$code"
    fail=1
  fi
}

echo "Checking $URL"

chk "app shell" "$URL/"
chk "backend through the proxy" "$URL/api/status"
chk "catalog" "$URL/api/dukan/catalog"

# SSE must answer with the streaming content-type, not a buffered body.
ctype=$(curl -sS -m 5 -o /dev/null -D - "$URL/events" 2>/dev/null \
  | tr -d '\r' | awk 'tolower($1) == "content-type:" {print $2; exit}')
case "$ctype" in
  text/event-stream*) printf '  ✅ %-34s %s\n' "live updates (/events)" "text/event-stream" ;;
  *) printf '  ❌ %-34s %s\n' "live updates (/events)" "content-type: ${ctype:-none} — the new-order chime needs this"
     fail=1 ;;
esac

echo
if [ "$fail" = 0 ]; then
  echo "✅ LIVE ACCEPTANCE PASS"
else
  echo "❌ LIVE ACCEPTANCE FAIL — see deploy/wispbyte/README.md § Troubleshooting"
fi
exit "$fail"
