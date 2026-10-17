#!/usr/bin/env bash
#
# Harden the laptop that runs the POS + WhatsApp bot.
#
# Run once on the box, as a user with sudo:
#
#     ./deploy/laptop/harden.sh
#
# Idempotent — re-running it converges rather than duplicating rules. Every
# change is asserted at the end, and a change that would lock out the current
# SSH session is applied only after the rule that keeps it open.
#
# Threat model, as stated: the internet is hostile, the home LAN is trusted.
# So the firewall trusts the LAN wholesale and denies everything else. A port
# forwarded from the router would arrive with a public source address and is
# still dropped — which is the case that matters, because the box sits behind a
# router that may or may not forward 22.
#
set -euo pipefail

LAN="${LAN:-192.168.29.0/24}"
SSHD_DROPIN=/etc/ssh/sshd_config.d/99-dukaan-hardening.conf
FAIL2BAN_JAIL=/etc/fail2ban/jail.d/dukaan-sshd.local

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/4  firewall — deny the internet, trust $LAN"
# Order matters: the LAN allow is added BEFORE the policy is enabled, so the
# session running this script is never the thing that gets cut off.
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw allow from "$LAN" comment 'trusted home LAN' >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status verbose

say "2/4  sshd — keys only, no password login"
# Key auth must already work before this lands. Check it first:
#     ssh -o PreferredAuthentications=publickey -o BatchMode=yes <box> true
sudo tee "$SSHD_DROPIN" >/dev/null <<'CONF'
# Managed by deploy/laptop/harden.sh
# Passwords are off: the box holds the WhatsApp session and a Supabase
# service_role key. A password is a guessable way in; a key is not.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
CONF
sudo sshd -t
sudo systemctl reload ssh

say "3/4  fail2ban — ban a brute-forcer at the door"
if ! dpkg -s fail2ban >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
fi
sudo tee "$FAIL2BAN_JAIL" >/dev/null <<'CONF'
# Managed by deploy/laptop/harden.sh
[sshd]
enabled = true
port = 22
maxretry = 4
findtime = 10m
bantime = 1h
CONF
sudo systemctl enable fail2ban >/dev/null 2>&1
sudo systemctl restart fail2ban

say "4/4  dufs — stop the read/write vault server"
# dufs served /srv/mac-vault on 0.0.0.0:5000 with --allow-all --enable-cors, so
# anyone who reached the port had full read/write. It is not needed by the POS
# or the bot. Move files with scp/rsync over the SSH key instead.
sudo systemctl stop dufs-vault 2>/dev/null || true
sudo systemctl disable dufs-vault >/dev/null 2>&1 || true

say "verify"
fail=0
chk() { # chk <description> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ✓ %s\n' "$1"
  else
    printf '  ✗ %s (expected %s, got %s)\n' "$1" "$2" "$3"; fail=1
  fi
}

# `systemctl is-active` prints the state AND exits non-zero when inactive, so
# capture once rather than appending a second copy via `||`.
dufs_state="$(systemctl is-active dufs-vault 2>/dev/null || true)"

# sshd reports root login as `without-password`, its own alias for
# `prohibit-password`; normalise before comparing.
root_login="$(sudo sshd -T | awk '/^permitrootlogin/{print $2}')"
[ "$root_login" = without-password ] && root_login=prohibit-password

chk "ufw is active"                 active "$(systemctl is-active ufw)"
chk "fail2ban is active"            active "$(systemctl is-active fail2ban)"
chk "dufs is stopped"               inactive "${dufs_state:-inactive}"
chk "password login is refused"     no "$(sudo sshd -T | awk '/^passwordauthentication/{print $2}')"
chk "root cannot use a password"    prohibit-password "$root_login"
chk "key login is allowed"          yes "$(sudo sshd -T | awk '/^pubkeyauthentication/{print $2}')"
chk "the bot still answers"         200 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/api/status)"

if [ "$fail" -ne 0 ]; then
  echo
  echo "One or more checks failed — fix before walking away from the box." >&2
  exit 1
fi

say "done"
echo "Note: the bot still binds 5001 on all interfaces, so the LAN can reach it."
echo "Every /api route requires a Supabase token, so that is authenticated, but"
echo "binding to loopback would remove the exposure entirely (see README)."
