# Dukaan.AI — run it on the laptop

`beyou@192.168.29.202` (Debian 12 / Q4OS, x86_64, 3.4 GB RAM). This box serves the
POS **and** the WhatsApp bot from one origin, so there is no CORS, no reverse
proxy and no hardcoded backend address anywhere.

```
        shopkeeper's browser                       customer's WhatsApp
                 │                                          │
                 │  loads the POS from Vercel (static),      │
                 │  then calls the API on the ngrok origin ───┐
                 ▼                                          ▼
        ┌────────────────────┐   ┌──────────────────────────────────────────┐
        │ Vercel             │   │ ngrok · systemd unit: ngrok              │
        │ dist/ only —       │   │ https://aurelio-chasmy-…ngrok-free.dev   │
        │ no functions,      │   └───────────────────┬──────────────────────┘
        │ no rewrites        │                       ▼
        └────────────────────┘   ┌──────────────────────────────────────────┐
                                 │  laptop · systemd unit: dukaan-bot       │
                                 │  node whatsapp/server.js                 │
                                 │    /            → ../dist (the POS)      │
                                 │    /api/*       → the bot's API  (token) │
                                 │    /api/ai/*    → model proxy (key stays)│
                                 │    /events      → SSE chime      (token) │
                                 │    /ops         → legacy console (off)   │
                                 │    Baileys socket → WhatsApp (outbound)  │
                                 └───────────────────┬──────────────────────┘
                                                     ▼   inference is remote:
                                          Supabase (registry,   Groq +
                                          owner catalog, orders) OpenRouter
```

Measured: ~105–125 MB RSS idle. The 4 GB laptop has ~20× headroom over the
512 MB free VPS that kept OOM-killing the bot.

## Day-2 operations

| Task | Command (as `beyou`) |
|---|---|
| Is it up? | `systemctl status dukaan-bot ngrok` |
| Restart the bot | `sudo systemctl restart dukaan-bot` |
| Restart the tunnel | `sudo systemctl restart ngrok` |
| Read the bot log | `sudo journalctl -u dukaan-bot -f` |
| Read the tunnel log | `sudo journalctl -u ngrok -f` |
| Prove the API is alive | `curl -s localhost:5001/api/status` |
| Prove the public URL | `curl -s https://<ngrok-domain>/api/status` |
| Change a secret | edit `~/dukaan.ai/.env`, then restart the bot |
| Re-apply the hardening | `~/dukaan.ai/deploy/laptop/harden.sh` |
| See who fail2ban banned | `sudo fail2ban-client status sshd` |

Logs go to the **journal**, not a file: Baileys' bundled libsignal prints Signal
session keys with a bare `console.warn`, and a world-readable log file would put
those on disk for every local user.

## Keep-awake

Suspending is already impossible; there is nothing to re-check:

- `HandleLidSwitch=ignore` (all three variants) in `logind.conf` — shutting the
  lid does nothing.
- `sleep.target suspend.target hibernate.target hybrid-sleep.target` are **masked**.
  This matters: KDE had `[AC][SuspendSession] idleTime=21600000` (6 h), so the
  desktop *would* have suspended on its own.

To undo after the hackathon:

```bash
sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

## The environment file

There is exactly **one** environment file, at the repository root:

```
~/dukaan.ai/.env      # chmod 600, git-ignored, never synced from the dev machine
```

Both the bot (`whatsapp/server.js`, `whatsapp/dukanBot.js`) and the Vite build
read it, and `.env.example` documents every variable it may contain. To change
any key — including after a rotation — edit that one file and restart the bot.
Nothing else on the box reads credentials.

This box's file was **migrated from the old `whatsapp/.env`**, which is no longer
read and has been moved aside (see `deploy/laptop/update.sh`). If you are reading
this before the migration has run, that is the file to merge from; the values are
the same names, minus the `VITE_` prefix on every server key.

`LLM_BASE_URL` / `LLM_MODEL_NAME` are deliberately **unset**: they point at a
local model server on port 8080 that does not exist here. Leaving them set made
the bot pay an 8 s abort on every message the cloud providers had already
failed. Absent, `callLocalSlm` returns immediately.

## Shipping a change

Prefer `deploy/laptop/update.sh`: it syncs, restarts, health-checks and
**rolls back on failure**. The manual equivalent, which that script automates:

```bash
# 1. on the dev machine — the build now refuses to ship a secret
cd /Users/dishu/Downloads/dukaan.ai
rm -rf dist && npm run build          # postbuild runs scripts/check-secrets.mjs

# 2. ship source + the built site.
#    `.env` is deliberately NOT synced: it is machine-local, and overwriting it
#    would replace this box's keys with the dev machine's.
rsync -az --delete \
      --exclude node_modules --exclude models --exclude '.venv*' \
      --exclude adapters --exclude .worktrees \
      --exclude auth_info --exclude '.env' --exclude 'whatsapp/.env' \
      ./ beyou@192.168.29.202:dukaan.ai/

# 3. restart
ssh beyou@192.168.29.202 'sudo systemctl restart dukaan-bot'
```

Never let `--delete` reach `whatsapp/auth_info/`: that is the linked WhatsApp
session, and re-pairing needs a QR scan. It is excluded above for that reason.

`npm run build` also enforces that the bundle does not contain the old hardcoded
`127.0.0.1:8080` model URL, and that no provider key reaches `dist/` — see
`scripts/check-secrets.mjs`, wired as `postbuild`.

## Security posture

Applied by `deploy/laptop/harden.sh`, and asserted at the end of that script:

| Layer | Setting |
|---|---|
| Firewall | `ufw` default-deny incoming; `192.168.29.0/24` trusted; everything else dropped |
| SSH | key-only (`PasswordAuthentication no`); root only by key; `fail2ban` on a 4-strike / 1 h sshd jail |
| API | every `/api/*` route and `/events` requires a Supabase access token, and the owner is derived from that token — so `?userId=` cannot be used to read another shop's orders |
| CORS | exact-match origin allowlist, no credentials, never `*` |
| `/ops` | the legacy Baileys/n8n console is off unless `ENABLE_OPS_CONSOLE=1` |
| Secrets | one root `.env` (600); the build fails if any of its values reaches `dist/` |
| dufs | stopped and disabled — it served a vault read/write with `--allow-all --enable-cors` |

The LAN is trusted by explicit instruction, so the firewall trusts it wholesale.
A port forwarded from the router arrives with a *public* source address and is
still dropped — but **check the router has no forward for 22**, since that is the
one thing this box cannot see for itself.

The bot binds `5001` on all interfaces, so the LAN can reach it. Every route is
token-checked, so that is authenticated rather than open; binding to loopback
would remove the exposure outright if you would rather not rely on the token.

## Supabase

Server side is verified working with the `service_role` key from this box:
`business_profiles` (shop registry, 3 shops with pins), `products` (owner
catalog, 31 rows) and `orders` (mirror) all answer.

Browser side needs one **dashboard** step, because the app's OAuth `redirectTo`
is `window.location.origin`:

> Supabase → **Authentication → URL Configuration** → *Redirect URLs* → add
> `https://aurelio-chasmy-dorsiventrally.ngrok-free.dev/**`
> and set *Site URL* to the same origin without the `/**`.

Without it Google sign-in returns to the wrong place. Guest mode still works,
but the demo should sign in.

## Known limits

1. **ngrok free interstitial.** The first navigation from a browser hits an ngrok
   "You are about to visit…" page; clicking **Visit Site** sets a cookie and
   everything works afterwards. It drops the query string, so a browser that has
   never clicked through and goes *straight* to the OAuth callback would lose its
   `?code=`. In practice the click-through happens on first load, before sign-in.
   The tunnel's own API/SSE calls are unaffected for non-browser clients.
   A custom domain on ngrok, or a Cloudflare tunnel, removes this.
2. **Vercel serves the front door, statically.** Vercel publishes `dist/` only —
   no serverless functions and no rewrites — and the browser calls the ngrok
   origin directly for `/api/*` and `/events`, using `VITE_API_BASE`. That is
   deliberate: the POS polls orders every 2.5 s, so proxying that through a Vercel
   function would spend the Hobby invocation budget ~34,000 times a day *per
   shopkeeper*. A rewrite is not just slow here, it is broken: a Vercel rewrite
   replays the browser's own headers to ngrok, so the ngrok interstitial would
   answer `/api/*` with HTML and the app would parse-fail.
3. **Provider keys never ship.** `VITE_OPENROUTER_API_KEY` used to be baked into
   `dist/assets/*.js`. The POS now calls `/api/ai/chat/completions` on this box,
   which holds the key in `.env` and forces `provider.data_collection=deny` so
   shop data is not retained or trained on. `scripts/check-secrets.mjs` fails the
   build if a key value, a key shape, or the old hardcoded `127.0.0.1:8080` URL
   reappears in the bundle.
4. **Do not reboot into Windows.** `/` is a loop-mounted ext4 image on the NTFS
   Windows partition (`root=/dev/loop0 loop=/Linux64/Debian12_S001/disks/root.disk`).
   If the machine reboots and picks Windows, the bot stays down until someone
   selects Linux at the boot menu.
