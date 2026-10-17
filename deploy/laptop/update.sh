#!/usr/bin/env bash
#
# Ship this checkout to the laptop, prove it works, or put the old one back.
#
#     ./deploy/laptop/update.sh              # build, sync, migrate, restart, verify
#     ./deploy/laptop/update.sh --check      # verify the running box, change nothing
#     ALLOW_DELETIONS=1 ./deploy/laptop/update.sh
#
# The order matters and is deliberate:
#
#   0. build here, where the toolchain is. The secret guard runs as `postbuild`,
#      so a bundle that would leak a key never reaches the network.
#   1. dry-run the sync and refuse to delete anything unexpected — this box holds
#      real orders and a paired WhatsApp session, and neither can be re-created
#      by re-running anything.
#   2. snapshot the remote tree, so "roll back" is a directory sync and not a
#      reconstruction.
#   3. sync. `.env` is excluded: it belongs to the machine, not the repo.
#   4. migrate to the single root .env, if that has not happened yet. This runs
#      before the restart, because the new code reads the root file.
#   5. restart, then check the box against the security contract — not just "did
#      it start". On any failure, restore the snapshot and say so loudly.
#
set -euo pipefail

HOST="${HOST:-beyou@192.168.29.202}"
REMOTE_DIR="${REMOTE_DIR:-dukaan.ai}"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"
PUBLIC_URL="${PUBLIC_URL:-https://aurelio-chasmy-dorsiventrally.ngrok-free.dev}"
NGROK_HEADER="ngrok-skip-browser-warning: 1"
SNAPSHOT="dukaan.ai.bak"
MODE="${1:-deploy}"

BOT_PORT=5001
BOT="http://127.0.0.1:5001"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST")
RSYNC_SSH="ssh -i $KEY -o BatchMode=yes"

# ── what the dev machine must never overwrite ────────────────────────────────
#   whatsapp/auth_info  the paired WhatsApp session. Losing it costs a QR scan
#                       and a phone in the room.
#   whatsapp/store      the LIVE orders and catalog. The dev machine also has
#                       these files, with older contents, so syncing them would
#                       silently destroy real orders.
#   .env                this box's keys. The dev machine's are different.
#   .git                the box's own history; not a deploy artifact.
#
# Kept twice on purpose: `EXCLUDES` for the local rsync, `EXCLUDES_STR` for
# commands that run on the remote. The string form keeps its quotes, so the
# remote shell cannot glob `.venv*` against its own working directory.
#
# Order matters to rsync — the first matching pattern wins — so the tracked
# template is included *before* the catch-all that protects every real env file.
EXCLUDES=(
  --include=.env.example
  --exclude=node_modules
  --exclude=models
  --exclude='.venv*'
  --exclude=adapters
  --exclude=.worktrees
  --exclude=.git
  --exclude=whatsapp/auth_info
  --exclude=whatsapp/store
  --exclude=.env
  --exclude='.env.*'
)
EXCLUDES_STR="--include=.env.example --exclude=node_modules --exclude=models --exclude='.venv*' --exclude=adapters --exclude=.worktrees --exclude=.git --exclude=whatsapp/auth_info --exclude=whatsapp/store --exclude=.env --exclude='.env.*'"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

# ── the security contract, checked against the running box ───────────────────
# Runs ON the laptop. Non-zero if the box is not in the state we claim it is in.
# This is what turns "it started" into "it is correct".
health_check() {
  "${SSH[@]}" "bash -s" <<EOF
set -uo pipefail
fail=0
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "\$@"; }
chk() { # chk <what> <expected> <actual>
  if [ "\$2" = "\$3" ]; then printf '  ✓ %s\n' "\$1"; else printf '  ✗ %s (want %s, got %s)\n' "\$1" "\$2" "\$3"; fail=1; fi
}

echo "  ── it answers, and only to what it should ──"
chk "the POS is served"                  200 "\$(code $BOT/)"
chk "the health check is public"         200 "\$(code $BOT/api/status)"
chk "orders need a token"                401 "\$(code $BOT/api/dukan/orders)"
chk "the QR needs a token"               401 "\$(code $BOT/api/qr)"
chk "the AI proxy needs a token"         401 "\$(code -X POST -H 'Content-Type: application/json' -d '{}' $BOT/api/ai/chat/completions)"
chk "the legacy console is off"          404 "\$(code $BOT/ops)"

echo "  ── the public health check describes the connection, not the shop ──"
body="\$(curl -s -m 15 $BOT/api/status)"
chk "it reports a status"                1 "\$(printf '%s' "\$body" | grep -c '"status"')"
chk "it carries no phone number"         0 "\$(printf '%s' "\$body" | grep -ci phone)"
chk "it carries no WhatsApp address"     0 "\$(printf '%s' "\$body" | grep -c '@s.whatsapp.net')"
chk "it carries no QR (a hijack vector)" 0 "\$(printf '%s' "\$body" | grep -ci '"qr"')"

echo "  ── the browser bundle is the one just built ──"
asset="\$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' \$HOME/$REMOTE_DIR/dist/index.html 2>/dev/null | head -1)"
chk "the page references a bundle"       1 "\$([ -n "\$asset" ] && echo 1 || echo 0)"
chk "that bundle is served"              200 "\$(code "$BOT\$asset")"

exit \$fail
EOF
}

# The same box, seen from the internet.
public_check() {
  local s ok=0
  s="$(curl -s -m 25 -H "$NGROK_HEADER" -o /tmp/.dukaan-public.json -w '%{http_code}' "$PUBLIC_URL/api/status" || true)"
  if [ "$s" = "200" ]; then note "✓ the tunnel answers /api/status (200)"; else note "✗ the tunnel answered $s for /api/status"; ok=1; fi

  s="$(curl -s -m 25 -H "$NGROK_HEADER" -o /tmp/.dukaan-public.html -w '%{http_code}' "$PUBLIC_URL/" || true)"
  if [ "$s" = "200" ] && grep -q '<title>' /tmp/.dukaan-public.html; then
    note "✓ the tunnel serves the POS"
  else
    note "✗ the tunnel answered $s for /"; ok=1
  fi
  return "$ok"
}

# ── check-only mode ──────────────────────────────────────────────────────────
if [ "$MODE" = "--check" ]; then
  say "on the box (nothing is changed)"
  health_check || { echo; echo "  the box is NOT in the expected state" >&2; exit 1; }
  say "from the internet"
  public_check || { echo; echo "  the public URL is NOT serving" >&2; exit 1; }
  say "ok"
  exit 0
fi

cd "$(dirname "$0")/../.."

say "0. build here (the secret guard runs as postbuild)"
note "commit $(git rev-parse --short HEAD)$(git diff --quiet || echo ' + uncommitted changes')"
rm -rf dist
npm run build >/tmp/.dukaan-build.log 2>&1 || { echo "  ✗ build failed:"; tail -20 /tmp/.dukaan-build.log; exit 1; }
[ -f dist/index.html ] || { echo "  ✗ dist/index.html is missing"; exit 1; }
note "✓ built dist/ ($(du -sh dist | cut -f1)) with no key and no loopback URL in it"

say "1. would this sync delete anything on the box?"
"${SSH[@]}" "test -d \$HOME/$REMOTE_DIR" || { echo "  ✗ $HOST:\$HOME/$REMOTE_DIR does not exist"; exit 1; }
DELETIONS="$(rsync -az --delete --dry-run --itemize-changes "${EXCLUDES[@]}" -e "$RSYNC_SSH" ./ "$HOST:$REMOTE_DIR/" \
  | awk '/^\*deleting/ {print $2}')"
if [ -n "$DELETIONS" ]; then
  note "the sync wants to delete these on the box:"
  printf '      %s\n' $DELETIONS
  if [ "${ALLOW_DELETIONS:-0}" != "1" ]; then
    echo
    echo "  Refusing to continue. The box holds live orders, so deleting is not a" >&2
    echo "  formality. If every path above is meant to be gone, re-run with:" >&2
    echo "      ALLOW_DELETIONS=1 ./deploy/laptop/update.sh" >&2
    exit 1
  fi
  note "ALLOW_DELETIONS=1 — proceeding"
else
  note "✓ nothing would be deleted"
fi

say "2. snapshot the box (a rollback is then a sync, not a reconstruction)"
"${SSH[@]}" "rsync -a --delete $EXCLUDES_STR \$HOME/$REMOTE_DIR/ \$HOME/$SNAPSHOT/ && printf '  ✓ snapshot: %s\n' \"\$(du -sh \$HOME/$SNAPSHOT | cut -f1)\""

say "3. sync the code"
LOCK_BEFORE="$(ssh -i "$KEY" -o BatchMode=yes "$HOST" "md5sum \$HOME/$REMOTE_DIR/whatsapp/package-lock.json 2>/dev/null | cut -d' ' -f1" || true)"
rsync -az --delete "${EXCLUDES[@]}" -e "$RSYNC_SSH" ./ "$HOST:$REMOTE_DIR/" && note "✓ synced"

say "4. the single root .env"
if "${SSH[@]}" "grep -q '^SUPABASE_SERVICE_KEY=..*' \$HOME/$REMOTE_DIR/.env" 2>/dev/null; then
  note "✓ already in place (the bot no longer reads whatsapp/.env)"
else
  note "migrating — this box still keeps its secrets in two files"
  # Capture the output and the exit status separately: piping straight into `sed`
  # would report sed's status, so a failed migration would look like a success
  # and the bot would be restarted with no configuration at all.
  MIG_RC=0
  MIG_OUT="$("${SSH[@]}" "ROOT=\$HOME/$REMOTE_DIR bash \$HOME/$REMOTE_DIR/deploy/laptop/migrate-env.sh" 2>&1)" || MIG_RC=$?
  printf '%s\n' "$MIG_OUT" | sed 's/^/  /'
  [ "$MIG_RC" -eq 0 ] || { echo "  ✗ the env migration failed (exit $MIG_RC) — not restarting" >&2; exit 1; }
  note "✓ migrated to the root .env"
fi

say "5. reconcile bot dependencies, only if the lockfile moved"
LOCK_AFTER="$(ssh -i "$KEY" -o BatchMode=yes "$HOST" "md5sum \$HOME/$REMOTE_DIR/whatsapp/package-lock.json 2>/dev/null | cut -d' ' -f1" || true)"
if [ "$LOCK_BEFORE" = "$LOCK_AFTER" ]; then
  note "✓ the bot's lockfile is unchanged — nothing to install"
else
  note "the lockfile changed; installing on the box"
  if "${SSH[@]}" "cd \$HOME/$REMOTE_DIR/whatsapp && (npm ci --omit=dev || npm install --omit=dev) >/tmp/.dukaan-npm.log 2>&1"; then
    note "✓ dependencies installed"
  else
    note "! install failed (see /tmp/.dukaan-npm.log) — the health check will judge"
  fi
fi

say "6. restart"
"${SSH[@]}" "sudo systemctl restart dukaan-bot" && note "✓ restarted"

note "waiting for it to answer…"
for _ in $(seq 1 30); do
  "${SSH[@]}" "curl -sf -m 5 -o /dev/null $BOT/api/status" 2>/dev/null && break
  sleep 2
done

say "7. verify the security contract on the box"
if ! health_check; then
  say "FAILED — rolling back"
  "${SSH[@]}" "rsync -a --delete $EXCLUDES_STR \$HOME/$SNAPSHOT/ \$HOME/$REMOTE_DIR/ && sudo systemctl restart dukaan-bot" \
    && note "✓ restored the previous checkout and restarted it"
  sleep 8
  if "${SSH[@]}" "curl -sf -m 5 -o /dev/null $BOT/api/status"; then
    note "✓ the box is answering again"
  else
    note "! the box is not answering — sudo journalctl -u dukaan-bot -n 50"
  fi
  echo
  echo "The new code was NOT deployed. The box is running what it ran before." >&2
  exit 1
fi

say "8. verify it from the internet"
public_check || {
  echo
  echo "  The box is correct but the tunnel is not serving — the tunnel is the" >&2
  echo "  problem, not the code, so nothing is rolled back." >&2
  echo "  Check: sudo systemctl status ngrok" >&2
  exit 1
}

say "9. did the WhatsApp session come back by itself?"
for _ in $(seq 1 20); do
  "${SSH[@]}" "curl -s -m 5 $BOT/api/status" | grep -q '"status":"connected"' && break
  sleep 3
done
if "${SSH[@]}" "curl -s -m 5 $BOT/api/status" | grep -q '"status":"connected"'; then
  note "✓ connected"
else
  note "! not connected yet — it may still be linking. Watch: sudo journalctl -u dukaan-bot -f"
fi

say "done"
note "commit $(git rev-parse --short HEAD) is live on the box and on $PUBLIC_URL"
note "rollback:  ssh $HOST \"rsync -a --delete $EXCLUDES_STR ~/$SNAPSHOT/ ~/$REMOTE_DIR/ && sudo systemctl restart dukaan-bot\""
