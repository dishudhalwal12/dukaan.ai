#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PASTE THIS into the Wispbyte panel → your server → Startup → "Startup Command".
#
# It is the box's entire process manager: diagnostics, code update, dependency
# install, then run. The free tier has no shell, so this output IS our debugger —
# open Console after starting and you can see node's version, the exact git
# revision running, and free disk.
#
# Also set, in the same panel:
#   Options   → Startup File     = whatsapp/server.js
#   Options   → Auto Update      = ON
#   Server Configuration         → PORT=16232  (+ your API keys; see README)
# ─────────────────────────────────────────────────────────────────────────────
# The panel always provides /home/container. DUKAN_ROOT exists only so this exact
# file can be run on a laptop during the stress test.
ROOT="${DUKAN_ROOT:-/home/container}"
# Wispbyte's Node.js image installs here; DUKAN_NODE is the laptop escape hatch.
NODE_BIN="${DUKAN_NODE:-/usr/local/bin/node}"
cd "$ROOT" || exit 1

echo "=== dukaan boot $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "node    : $("$NODE_BIN" -v 2>&1)"
echo "revision: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'no git')"
echo "disk    : $(df -h "$ROOT" | tail -1)"

# Keep the checkout current. The panel's "Auto Update on Startup" toggle does
# this too; doing it here as well is harmless and makes the behaviour explicit.
if [ -d "$ROOT/.git" ]; then
  git -C "$ROOT" pull --ff-only || echo "(pull skipped)"
fi

# Install ONLY the bot's runtime dependencies. The Vite/TypeScript toolchain is
# never installed here: 512 MiB / 1 GiB cannot be asked to run a frontend build.
# Skip the install when the lockfile has not moved — restarts stay fast.
NPM=/usr/local/bin/npm
[ -x "$NPM" ] || NPM=npm
cd "$ROOT/whatsapp" || exit 1
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "installing bot dependencies …"
  "$NPM" install --omit=dev --no-audit --no-fund || exit 1
fi
cd "$ROOT"

# 512 MiB of RAM: cap the V8 heap well below the ceiling so the box can never
# OOM-kill the bot. Measured peak under load is ~139 MiB.
export NODE_OPTIONS="--max-old-space-size=384"

echo "starting bot on port ${PORT:-5001} …"
exec "$NODE_BIN" "$ROOT/whatsapp/server.js"
