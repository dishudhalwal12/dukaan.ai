#!/usr/bin/env bash
#
# One-time: collapse this box's two environment files into the single root .env.
#
#     ./deploy/laptop/migrate-env.sh
#
# Background: the bot used to read `whatsapp/.env` while the frontend keys lived
# in a root `.env` — and the root one held `VITE_OPENROUTER_API_KEY`, which the
# old vite config inlined into the public browser bundle. There is now one file,
# at the repository root, read by both the bot and a build.
#
# Idempotent, and it prints no secret values. It:
#   * backs up both existing files (mode 600) before touching anything,
#   * copies the server-side names from `whatsapp/.env` into the root `.env`,
#   * adds CORS_ORIGINS and OPERATOR_USER_IDS, which the new code requires,
#   * drops every VITE_ key, which on this machine were inert duplicates of
#     server keys and the reason a key could leak into a bundle,
#   * moves `whatsapp/.env` aside, so the same secrets do not live in two places.
#
# Run as the user that owns the checkout (no sudo needed). `ROOT` may be set to
# point at the checkout; otherwise it is two levels up from this script.
#
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
OLD="$ROOT/whatsapp/.env"
NEW="$ROOT/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
# Backups live OUTSIDE the checkout. A file called `.env.pre-migration.*` matches
# no `.gitignore` rule, and a backup of a file full of keys is exactly the thing
# that should never be one `git add -A` away from being committed.
BACKUP_DIR="${BACKUP_DIR:-$HOME/.dukaan-env-backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

: "${CORS_ORIGINS:=https://dukaan-ai-beta.vercel.app,https://aurelio-chasmy-dorsiventrally.ngrok-free.dev}"
: "${OPERATOR_USER_IDS:=}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

# The server-side names this box may use. Copied from the old file verbatim, by
# line, so nothing is re-parsed or re-quoted. A name the old file lacks is skipped.
SERVER_NAMES="PORT AUTH_DIR GROQ_API_KEY GROQ_MODEL OPENROUTER_API_KEY OPENROUTER_MODEL \
SUPABASE_URL SUPABASE_SERVICE_KEY SUPABASE_SERVICE_ROLE_KEY \
DUKAN_MAX_DELIVERY_KM DUKAN_ORDERS_FILE DUKAN_CATALOG_FILE DUKAN_DEFAULT_OWNER_ID \
N8N_WEBHOOK_URL"

say "before"
printf '  %s\n' "$([ -f "$NEW" ] && echo "root .env exists (mode $(mode "$NEW"))" || echo 'root .env absent')"
printf '  %s\n' "$([ -f "$OLD" ] && echo "whatsapp/.env exists (mode $(mode "$OLD"))" || echo 'whatsapp/.env absent')"

# ── already done? ────────────────────────────────────────────────────────────
if grep -q '^SUPABASE_SERVICE_KEY=..*' "$NEW" 2>/dev/null; then
  say "already migrated — nothing to do"
  printf '  %s carries the server keys and is the only file the bot reads\n' "$NEW"
  exit 0
fi

if [ ! -f "$OLD" ]; then
  say "cannot migrate"
  echo "There is no whatsapp/.env to read server keys from, and the root .env does" >&2
  echo "not carry them. Create the root file from .env.example, then re-run." >&2
  exit 1
fi

say "copy both aside first"
# The root file is copied (it is being replaced); whatsapp/.env is MOVED below,
# once its contents have been read — so no secret is left at the path the old bot
# used to read. Both backups are the rollback.
if [ -f "$NEW" ]; then
  cp -p "$NEW" "$BACKUP_DIR/root.env.$STAMP"
  chmod 600 "$BACKUP_DIR/root.env.$STAMP"
  printf '  root .env      -> %s/root.env.%s\n' "$BACKUP_DIR" "$STAMP"
fi

say "write the single root .env"
tmp="$(mktemp)"; chmod 600 "$tmp"
{
  echo "# Dukaan.AI environment — the single file. Documented by .env.example."
  echo "# Written by deploy/laptop/migrate-env.sh on $STAMP."
  echo "# Server keys only: nothing VITE_ here, because a VITE_ value is inlined"
  echo "# into the public browser bundle, and this box does not build the frontend."
  echo
  for name in $SERVER_NAMES; do
    line="$(grep -m1 -E "^${name}=" "$OLD" 2>/dev/null || true)"
    [ -n "$line" ] && echo "$line"
  done
  echo
  echo "# Browser origins permitted to call this API. The Vercel deployment and the"
  echo "# tunnel domain. Same-origin calls (the POS served by this bot) need no entry."
  echo "CORS_ORIGINS=$CORS_ORIGINS"
  echo
  echo "# Supabase user ids allowed to use operator-only routes: send as the business,"
  echo "# read customer chats, the webhook log, the runtime AI-key setter. Empty means"
  echo "# nobody, which the POS does not need. Add your own id to use the /ops console."
  echo "OPERATOR_USER_IDS=$OPERATOR_USER_IDS"
} > "$tmp"
mv "$tmp" "$NEW"
chmod 600 "$NEW"

say "retire whatsapp/.env"
# Now that its contents are copied, move it out of the path the old bot read.
mv "$OLD" "$BACKUP_DIR/whatsapp.env.$STAMP"
chmod 600 "$BACKUP_DIR/whatsapp.env.$STAMP"
printf '  whatsapp/.env  -> %s/whatsapp.env.%s\n' "$BACKUP_DIR" "$STAMP"
printf '  the bot now reads only %s\n' "$NEW"

say "verify"
fail=0
chk() { if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s (expected %s, got %s)\n' "$1" "$2" "$3"; fail=1; fi; }
has() { grep -c "$1" "$2" 2>/dev/null || true; }

chk "the root .env is private (600)"              "600" "$(mode "$NEW")"
chk "it carries the Supabase service key"         "1" "$(has '^SUPABASE_SERVICE_KEY=..*' "$NEW")"
chk "it carries the AI provider keys"             "1" "$(has '^GROQ_API_KEY=..*' "$NEW")"
chk "AUTH_DIR is preserved"                       "1" "$(has '^AUTH_DIR=./auth_info' "$NEW")"
chk "the port is preserved"                       "1" "$(has '^PORT=[0-9]' "$NEW")"
chk "CORS_ORIGINS is set"                         "1" "$(has '^CORS_ORIGINS=..*' "$NEW")"
chk "no VITE_ secret is offered"                  "0" "$(has '^VITE_' "$NEW")"
chk "the old file is out of the read path"        "0" "$([ -f "$OLD" ] && echo 1 || echo 0)"
chk "no secret is left world-readable"            "0" "$(find "$ROOT" -maxdepth 1 -name '.env*' ! -name '.env.example' -perm -o+r 2>/dev/null | wc -l | tr -d ' ')"

if [ "$fail" -ne 0 ]; then
  echo
  echo "A check failed. Both originals are in $BACKUP_DIR:" >&2
  echo "  root.env.$STAMP and whatsapp.env.$STAMP" >&2
  echo "restore them and investigate before restarting the bot." >&2
  exit 1
fi

say "done"
echo "Restart the bot to pick it up:   sudo systemctl restart dukaan-bot"
