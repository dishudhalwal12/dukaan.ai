#!/usr/bin/env bash
# Dukaan.AI — Serv00 server bootstrap. Run this ON the Serv00 server, over SSH,
# from the repository root:
#
#   cd ~/domains/<DOMAIN>/public_nodejs
#   bash deploy/serv00/setup.sh <DOMAIN>
#
# It is safe to re-run: every step is idempotent.
set -euo pipefail

# Non-interactive SSH sessions get a minimal PATH; devil/crontab live here.
export PATH="/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/bin:$PATH"

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: bash deploy/serv00/setup.sh <DOMAIN>   (e.g. bash deploy/serv00/setup.sh yourlogin.serv00.net)" >&2
  exit 1
fi

# The repo root is two levels up from deploy/serv00/. Passenger wants app.js there.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "== Dukaan.AI Serv00 bootstrap =="
echo "   domain : $DOMAIN"
echo "   project: $ROOT"

# ── 1. npm global prefix + PATH (Serv00 requirement, survives re-runs) ────────
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global" >/dev/null 2>&1 || true
if ! grep -q 'npm-global/bin' "$HOME/.bash_profile" 2>/dev/null; then
  echo 'export PATH=~/.npm-global/bin:~/bin:$PATH' >> "$HOME/.bash_profile"
fi

# ── 2. Pin Node.js 22 (the version Server runs by default) ────────────────────
mkdir -p "$HOME/bin"
if [ -x /usr/local/bin/node22 ]; then
  ln -fs /usr/local/bin/node22 "$HOME/bin/node"
  ln -fs /usr/local/bin/npm22  "$HOME/bin/npm"
fi
echo "   node   : $(command -v node) -> $(node -v 2>/dev/null || echo 'not found')"

# ── 3. Backend dependencies (the bot only; the frontend is built on your Mac) ─
echo "   installing backend dependencies …"
( cd "$ROOT/whatsapp" && { npm ci --omit=dev || npm install --omit=dev; } )

# ── 4. Passenger entry point (app.js) at the project root ─────────────────────
cp "$ROOT/deploy/serv00/app.js" "$ROOT/app.js"
echo "   wrote $ROOT/app.js"

# ── 5. Secrets file — created from the template, then YOU fill it in ──────────
if [ -f "$ROOT/whatsapp/.env" ]; then
  echo "   whatsapp/.env already exists — left untouched"
else
  cp "$ROOT/whatsapp/.env.example" "$ROOT/whatsapp/.env"
  echo "   created whatsapp/.env from template  ⚠️  YOU MUST EDIT IT (see README Part 4)"
fi

# ── 6. Static frontend must be uploaded into public/ (see README Part 5) ──────
if [ -f "$ROOT/public/index.html" ]; then
  echo "   frontend found in public/ ✅"
else
  echo "   ⚠️  public/index.html missing — upload the frontend build (README Part 5)"
fi

# ── 7. One Passenger process is plenty for this app (measured ~90–130 MB) ─────
devil www options "$DOMAIN" processes 1 2>/dev/null || echo "   (note: 'devil www options processes' too, can set it in the panel)"

# ── 8. Keep-alive cron: Serv00 stops an app after 24 h with no requests ───────
# Hitting our own /api/status every 10 min resets that timer forever.
KEEP='*/10 * * * * /usr/bin/fetch -q -T 30 -o /dev/null'
( crontab -l 2>/dev/null | grep -v 'dukaan-keepalive' || true;
  echo "$KEEP https://$DOMAIN/api/status # dukaan-keepalive" ) | crontab -
echo "   keep-alive cron installed (every 10 min)"

# ── 9. (Re)start the website so Passenger picks up the new app ────────────────
devil www restart "$DOMAIN" 2>/dev/null || echo "   (note: restart failed — use the panel: WWW websites → Details → Restart)"
echo "   done."

echo
echo "Next: edit whatsapp/.env with your keys, then open https://$DOMAIN"
