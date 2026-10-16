#!/usr/bin/env bash
# Dukaan.AI — build the POS frontend on YOUR Mac and upload it to Serv00.
# Run this from the repository root:
#
#   ./deploy/serv00/upload-frontend.sh <user@host> <DOMAIN> [ssh-port]
#   e.g. ./deploy/serv00/upload-frontend.sh mylogin@s5.serv00.com mylogin.serv00.net
#
# Why build on the Mac, not the server? The server caps memory (~512 MB) and the
# Vite/TypeScript toolchain needs the dev dependencies; your Mac builds this app
# in seconds with zero risk of being killed mid-build.
set -euo pipefail

TARGET="${1:-}"
DOMAIN="${2:-}"
PORT="${3:-22}"
if [ -z "$TARGET" ] || [ -z "$DOMAIN" ]; then
  echo "Usage: ./deploy/serv00/upload-frontend.sh <user@host> <DOMAIN> [ssh-port]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== building frontend =="
if [ ! -d node_modules ]; then
  npm ci
fi
npm run build

DEST="domains/$DOMAIN/public_nodejs/public"
echo "== uploading dist/ -> $TARGET:$DEST =="
if command -v rsync >/dev/null 2>&1; then
  rsync -azah --info=progress2 -e "ssh -p $PORT" dist/ "$TARGET:$DEST/"
else
  ssh -p "$PORT" "$TARGET" "mkdir -p $DEST"
  scp -P "$PORT" -r dist/* "$TARGET:$DEST/"
fi

echo
echo "✅ frontend uploaded. Now restart the site on the server:"
echo "   ssh -p $PORT $TARGET 'devil www restart $DOMAIN'"
