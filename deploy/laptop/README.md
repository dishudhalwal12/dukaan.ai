# Dukaan.AI — run it on the laptop

`beyou@192.168.29.202` (Debian 12 / Q4OS, x86_64, 3.4 GB RAM). This box serves the
POS **and** the WhatsApp bot from one origin, so there is no CORS, no reverse
proxy and no hardcoded backend address anywhere.

```
        shopkeeper's browser                       customer's WhatsApp
                 │                                          │
                 │ https://aurelio-chasmy-dorsiventrally.ngrok-free.dev
                 ▼                                          ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  ngrok (static domain, systemd unit: ngrok)                 │
        └──────────────────────────┬──────────────────────────────────┘
                                   ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  laptop · systemd unit: dukaan-bot                          │
        │  node whatsapp/server.js                                    │
        │    /            → ../dist  (the built POS)                   │
        │    /api/*       → the bot's API                              │
        │    /events      → SSE (order chime)                          │
        │    /ops         → legacy Baileys/n8n console                 │
        │    Baileys socket → WhatsApp (outbound, survives NAT)        │
        └─────────────────────────────────────────────────────────────┘
                                   │
                                   ▼            inference is remote:
                        Supabase (registry,      Groq + OpenRouter
                        owner catalog, orders)
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
| Change a secret | edit `~/dukaan.ai/whatsapp/.env`, then restart the bot |

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

## What is NOT in `whatsapp/.env`

`LLM_BASE_URL` / `LLM_MODEL_NAME` were removed on purpose: they point at a local
model server on port 8080 that does not exist here. Leaving them in made the bot
pay an 8 s abort on every message the cloud providers had already failed. With
them absent, `callLocalSlm` returns immediately.

## Shipping a change

The POS is **built on the development machine**, not here (this box has no
root `node_modules` and no Vite toolchain, and does not need one):

```bash
# 1. on the dev machine
cd /Users/dishu/Downloads/dukaan.ai
rm -rf dist && npm run build          # .env.production.local blanks VITE_LLM_*

# 2. ship source + build
rsync -az --exclude node_modules --exclude models --exclude '.venv*' \
      --exclude adapters --exclude .worktrees \
      ./ beyou@192.168.29.202:dukaan.ai/

# 3. restart
ssh beyou@192.168.29.202 'sudo systemctl restart dukaan-bot'
```

`npm run build` is *not* a no-op on the local model fallback: the browser bundle
must not contain `127.0.0.1:8080` (see `src/utils/openrouterClient.ts`). Verify:

```bash
grep -c 8080 dist/assets/*.js        # must be 0
```

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
2. **The OpenRouter key ships to the browser.** `VITE_OPENROUTER_API_KEY` is baked
   into `dist/assets/*.js` (2 occurrences) because the POS calls OpenRouter
   directly. The Groq key and the Supabase `service_role` key are **not** in the
   bundle. Moving the POS's AI calls behind `/api/ai/*` is the fix; until then
   treat that key as public.
3. **Do not reboot into Windows.** `/` is a loop-mounted ext4 image on the NTFS
   Windows partition (`root=/dev/loop0 loop=/Linux64/Debian12_S001/disks/root.disk`).
   If the machine reboots and picks Windows, the bot stays down until someone
   selects Linux at the boot menu.
