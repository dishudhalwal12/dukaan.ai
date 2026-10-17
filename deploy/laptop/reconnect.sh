#!/usr/bin/env bash
#
# Make the laptop come back, unattended, after a power cut or a reboot.
#
# Run once on the box, as a user with sudo:
#
#     ./deploy/laptop/reconnect.sh
#
# Idempotent. Covers the four ways this box has actually failed or could fail:
#
#   1. the Wi-Fi profile would not rejoin after a reboot (AUTOCONNECT=no), so
#      the box came up with no network at all;
#   2. ngrok started before the network did, and retried against nothing;
#   3. a hung bot or a dropped tunnel is invisible — `Restart=always` only fires
#      when the process *exits*;
#   4. GRUB hid its menu for one second, so a boot that went wrong gave nobody a
#      chance to choose Linux.
#
# Deliberately NOT done here: kernel/console blanking. The panel blanking is
# cosmetic — the desktop runs on X, not the text console — and the thing that
# would actually stop the bot, suspend, is already impossible (the sleep targets
# are masked, `HandleLidSwitch=ignore`). Editing the boot-critical custom GRUB
# entry to save a screen is not a trade worth making two days before a demo.
#
set -euo pipefail

NGROK_DROPIN_DIR=/etc/systemd/system/ngrok.service.d
WATCHDOG=/usr/local/bin/dukaan-watchdog
GRUB=/etc/default/grub

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

say "1/5  Wi-Fi — rejoin automatically after a reboot"
# Without this the box boots with no network, and nothing downstream can work.
WIFI="$(nmcli -t -f NAME,TYPE connection show --active | awk -F: '$2=="802-11-wireless"{print $1; exit}')"
if [ -z "$WIFI" ]; then
  echo "  no active Wi-Fi profile found — skipping" >&2
else
  nmcli connection modify "$WIFI" connection.autoconnect yes
  printf '  %s: AUTOCONNECT now %s\n' "$WIFI" "$(nmcli -t -f NAME,AUTOCONNECT connection show | awk -F: -v n="$WIFI" '$1==n{print $2}')"
fi

say "2/5  ngrok — start only once the network is up"
mkdir -p "$NGROK_DROPIN_DIR"
cat > "$NGROK_DROPIN_DIR/10-network-online.conf" <<'CONF'
# Managed by deploy/laptop/reconnect.sh
# The tunnel is useless before there is a network. ngrok used to start before
# one existed and spent its first attempts failing.
[Unit]
After=network-online.target
Wants=network-online.target
CONF
systemctl daemon-reload
printf '  drop-in written\n'

say "3/5  watchdog — restart a hung bot or a dead tunnel"
# `Restart=always` on both units handles a crash. It cannot see a process that
# is still running but no longer working, which is the failure that costs
# hours when nobody is looking at the box.
cat > "$WATCHDOG" <<'WATCH'
#!/usr/bin/env bash
# Managed by deploy/laptop/reconnect.sh
set -uo pipefail

stamp() { date '+%F %T'; }

# A restart while a unit is still starting turns a slow boot into a loop. This
# box takes ~80 s to reach network-online and another ~30 s for the bot to bind,
# so a check firing inside that window would kill a perfectly healthy start.
grace() { # grace <unit> -> whole seconds since it became active
  local ts now
  ts="$(systemctl show -p ActiveEnterTimestamp --value "$1" 2>/dev/null)"
  now="$(date +%s)"
  [ -z "$ts" ] && { printf '0'; return; }
  printf '%s' "$(( now - $(date -d "$ts" +%s 2>/dev/null || echo "$now") ))"
}

GRACE=180

# 1. the bot must answer its own health endpoint
age="$(grace dukaan-bot)"
if [ "$age" -lt "$GRACE" ]; then
  echo "$(stamp) dukaan-bot is ${age}s into its start (grace ${GRACE}s) — leaving it alone"
elif ! curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:5001/api/status; then
  echo "$(stamp) bot unresponsive after ${age}s up -> restarting dukaan-bot"
  systemctl restart dukaan-bot
  exit 0
fi

# 2. ngrok must have a live tunnel. Its process stays up while the tunnel can be
#    gone (dropped session, revoked authtoken), and Restart=always never fires
#    because nothing exited.
age="$(grace ngrok)"
if [ "$age" -lt "$GRACE" ]; then
  echo "$(stamp) ngrok is ${age}s into its start (grace ${GRACE}s) — leaving it alone"
elif ! curl -fsS --max-time 10 http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q '"public_url"'; then
  echo "$(stamp) no live ngrok tunnel after ${age}s up -> restarting ngrok"
  systemctl restart ngrok
fi

exit 0
WATCH
chmod 0755 "$WATCHDOG"

cat > /etc/systemd/system/dukaan-watchdog.service <<'CONF'
# Managed by deploy/laptop/reconnect.sh
[Unit]
Description=Dukaan.AI watchdog — restart a hung bot or a dead tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dukaan-watchdog
CONF

cat > /etc/systemd/system/dukaan-watchdog.timer <<'CONF'
# Managed by deploy/laptop/reconnect.sh
[Unit]
Description=Run the Dukaan.AI watchdog every two minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=2min
AccuracySec=15s
Unit=dukaan-watchdog.service

[Install]
WantedBy=timers.target
CONF

systemctl daemon-reload
systemctl enable --now dukaan-watchdog.timer >/dev/null 2>&1
printf '  timer: %s\n' "$(systemctl is-active dukaan-watchdog.timer)"

say "4/5  GRUB — show the menu instead of hiding it for one second"
# GRUB_DEFAULT stays 0 on purpose. The Linux entry is generated by
# /etc/grub.d/09_custom1, which sorts BEFORE 30_os-prober, so entry 0 is always
# Q4OS — pinning by index cannot drift the way a title can be renamed.
set_grub() { # set_grub KEY VALUE
  if grep -qE "^[[:space:]]*$1=" "$GRUB"; then
    sed -i -E "s|^[[:space:]]*$1=.*|$1=$2|" "$GRUB"
  else
    printf '%s=%s\n' "$1" "$2" >> "$GRUB"
  fi
}
cp -a /boot/grub/grub.cfg "/boot/grub/grub.cfg.pre-reconnect.$(date +%s)"

set_grub GRUB_TIMEOUT_STYLE menu
set_grub GRUB_TIMEOUT 10
set_grub GRUB_RECORDFAIL_TIMEOUT 10

update-grub >/dev/null 2>&1

# The firmware boots \EFI\DebianBoot\shimx64.efi, so the copy GRUB actually
# reads is the one on the ESP. Keep all four identical, as they already are.
NEW=/boot/grub/grub.cfg
for f in /boot/efi/EFI/DebianBoot/grub.cfg /boot/efi/EFI/debian/grub.cfg /boot/efi/EFI/Q4OS/grub.cfg; do
  [ -f "$f" ] && cp "$NEW" "$f"
done

say "5/5  verify the box can still boot before trusting it to"
fail=0
chk() {
  if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s (expected %s, got %s)\n' "$1" "$2" "$3"; fail=1; fi
}

# The regenerated config must still contain the loop= boot path for this box.
# 09_custom1 writes `loop=$diskimgfl`, so match the variable, not the literal
# path — grepping for the path can never match and would fail on a good config.
first_entry="$(awk '/^menuentry/{n++} n==1{print}' "$NEW" | head -1)"
chk "the first menu entry is still Linux" "menuentry \"Q4OS Aquarius Desktop\" {" "$first_entry"
chk "the config keeps the loop= boot path" "1" "$(grep -cF 'loop=$diskimgfl' "$NEW")"
chk "the loop image path is still declared" "1" "$(grep -cF 'set diskimgfl="/Linux64/Debian12_S001/disks/root.disk"' "$NEW")"
# One `linux` line and one `initrd` line.
chk "the boot kernel and initrd are present" "2" "$(grep -cE '^[[:space:]]*(linux|initrd) /EFI/DebianBoot/' "$NEW")"
chk "the menu is visible" "menu" "$(grep -E '^[[:space:]]*GRUB_TIMEOUT_STYLE=' "$GRUB" | cut -d= -f2)"
chk "the timeout is long enough to react" "10" "$(grep -E '^[[:space:]]*GRUB_TIMEOUT=' "$GRUB" | cut -d= -f2)"
chk "every ESP copy matches the generated config" "3" "$(for f in /boot/efi/EFI/DebianBoot/grub.cfg /boot/efi/EFI/debian/grub.cfg /boot/efi/EFI/Q4OS/grub.cfg; do sudo diff -q "$NEW" "$f" >/dev/null 2>&1 && echo ok; done | grep -c ok)"
chk "Wi-Fi will rejoin on its own" "yes" "$(nmcli -t -f NAME,AUTOCONNECT connection show | awk -F: -v n="${WIFI:-Dishu_5G}" '$1==n{print $2}')"
chk "the watchdog timer is running" "active" "$(systemctl is-active dukaan-watchdog.timer)"
chk "the watchdog passes right now" "0" "$("$WATCHDOG" >/dev/null 2>&1; echo $?)"

if [ "$fail" -ne 0 ]; then
  echo
  echo "A check failed — the previous config is at /boot/grub/grub.cfg.pre-reconnect.*" >&2
  echo "Do NOT reboot until this is fixed." >&2
  exit 1
fi

say "done"
echo "Safe to reboot. Nothing here needs a human at the keyboard any more,"
echo "except choosing Linux if the menu ever appears."
