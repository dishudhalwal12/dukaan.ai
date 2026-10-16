# Deploy Dukaan.AI to Serv00 (free, no credit card)

This is the whole deployment. Follow it top to bottom, one step at a time.
Nothing here changes `main` — it all lives on the `deploy/serv00` branch.

---

## 0. Which host, and why this one

You asked for **one** host that is **free, always-on, and takes no credit card**.

| Host | Card? | Always-on? | RAM | Verdict for this bot |
|---|---|---|---|---|
| **Serv00** | **no** ✅ | yes, with a keep-alive (see Part 7) | 512 MB | **← chosen** |
| Google Cloud e2-micro | card | yes | 1 GB | better, but blocked by the card gate |
| Oracle A1 | card | yes | 12 GB | rejected your card |
| Cloudflare Workers | no | no (serverless) | 128 MB | cannot hold a WhatsApp socket |
| Render / Railway / Koyeb / Fly | varies | no (sleep) | 256–512 MB | sleep kills the WhatsApp session |

**Serv00 wins the one thing that matters to you: no credit card.** It is a real
always-on host with a real disk and SSH — not serverless.

> About "mining": if you literally mean crypto mining, **no** free host allows it
> (Serv00, Google, Oracle all ban it in their terms, and they will delete the
> account). This guide is for **hosting the Dukaan.AI bot**, which is what we
> need for the 20 Oct demo.

### The two Serv00 gotchas — and how we kill both

1. **Serv00 stops an app that gets no web request for 24 h.**
   → Part 7 installs a cron that pings our own `/api/status` every 10 minutes.
   That counts as a request, so the timer never fires. Solved.
2. **Serv00 runs the app behind Phusion Passenger, which *might* buffer the
   `/events` live-update stream.**
   → Harmless. I checked the app: `src/App.tsx:543` already polls the backend
   every 2.5 s as a fallback. Worst case you lose the "new order" chime; the
   order still shows up in the POS within 2.5 s. **No code change needed.**

---

## 1. Measured resource usage (real numbers, measured on this repo)

Server CPU: Apple M-series / Node v22.22.2. Bot run with `whatsapp/server.js`.

| What | Measured | Meaning for Serv00 (512 MB) |
|---|---|---|
| Empty Node process | 35 MB | baseline |
| **Bot idle** (Express + Baileys) | **84–111 MB** | fits ~5× over |
| RSS with **5 clients** connected | **+0 MB** | each client ≈ a few KB |
| CPU for 300 API requests | 0.27 s → **~0.9 ms/request** | nothing |
| Peak estimate under demo load | **~150 MB** | ~30% of the cap |

**Disk on the server:**

| Part | Size |
|---|---|
| Repo code (tracked files) | 1.6 MB |
| `whatsapp/node_modules` (backend deps) | ~65 MB |
| Built frontend `dist/` | 0.7 MB |
| **Total** | **≈ 70–90 MB of Serv00's 3 GB (~3%)** |

**If 5 customers message the chatbot at once:** memory grows by **≈ 0 MB** and
the server's CPU stays near idle. Reason: this bot is a *relay*. Each message is
one inbound WebSocket frame on the single shared Baileys socket, then one HTTPS
call to Groq/OpenRouter — and **the language model runs on those remote servers,
not on Serv00**. So per-user cost is network round-trips, not RAM or CPU.
Five users, fifty users — Serv00 won't notice. The limit is Baileys itself, and
that single process is the ~100 MB you see above.

> Where your local `2.4 GB` went: `models/`, `.venv/`, `.venv_mlx/`, `adapters/`,
> `.worktrees/` — all local-only training artifacts. **None of it is deployed.**

---

## 2. What you need before you start

- A Serv00 account (free). Sign up at **https://www.serv00.com** — it emails you
  a **login**, an **SSH host** (like `s5.serv00.com`) and a password.
- Your secret keys from your laptop's `.env` files (you already have them).
- Your Mac, in this repo folder.

Serv00 names to write down as you go:

- `<LOGIN>` — your Serv00 username (e.g. `deku`).
- `<HOST>` — your SSH host (e.g. `s5.serv00.com`).
- `<DOMAIN>` — your free web address. It is usually `<LOGIN>.serv00.net`.
  Confirm it in the panel: **panel.serv00.com → WWW websites** (or **DNS**).

---

## 3. Part 1 — Add the Node.js website (panel, clicks only)

1. Go to **https://panel.serv00.com** and log in.
2. Open the **`WWW websites`** tab.
3. If `<LOGIN>.serv00.net` is already listed, skip to step 5.
   Otherwise click **`+ Add new website`**.
4. Click **`advanced settings`**, then:
   - **Domain:** `<DOMAIN>` (e.g. `deku.serv00.net`)
   - **Website type:** **`Node.js`**
   - **Node.js binary:** the **highest** available — `24`, `25` or `26`
     (setup.sh needs Node ≥ 22.12; see Part 3)
   - **Environment:** `production`
   - Click **`add`**.
5. Done — Serv00 creates `/usr/home/<LOGIN>/domains/<DOMAIN>/public_nodejs/`.

> Keep it on HTTP for now. We turn on HTTPS (green padlock) in Part 6, **after**
> the site works.

---

## 4. Part 2 — Get the code onto the server

Open a terminal on your **Mac** and SSH in:

```bash
ssh <LOGIN>@<HOST>
```

Type `yes` at the fingerprint prompt, then your Serv00 password.
You are now on the server. Paste this (replace `<DOMAIN>`):

```bash
cd ~/domains/<DOMAIN>
rm -rf public_nodejs
git clone -b deploy/serv00 https://github.com/dishudhalwal12/dukaan.ai.git public_nodejs
cd public_nodejs
```

- If the clone asks for a **username/password**, the repo is private. Either make
  it public (GitHub → repo → Settings → Danger Zone → Change visibility → Public),
  or use an HTTPS token: `git clone -b deploy/serv00 https://<TOKEN>@github.com/dishudhalwal12/dukaan.ai.git public_nodejs`.
- If the repo is **public** but you get `public_nodejs already exists`, the
  `rm -rf` above already handled it.

---

## 5. Part 3 — Install the backend (one command, on the server)

Still SSH'd in, in the repo root:

```bash
bash deploy/serv00/setup.sh <DOMAIN>
```

What it does (safe to re-run): sets the npm prefix, pins Node 22, installs
`whatsapp/node_modules`, writes `app.js` (the Passenger entry point), creates
`whatsapp/.env` from the template, sets one Passenger process, installs the
keep-alive cron, and restarts the site.

---

## 6. Part 4 — Fill in your secrets (on the server)

`setup.sh` created `whatsapp/.env` from the template (its two defaults —
`LLM_BASE_URL` and `DUKAN_MAX_DELIVERY_KM=5` — are already set). Open it:

```bash
nano ~/domains/<DOMAIN>/public_nodejs/whatsapp/.env
```

Uncomment and fill **at least**: `GROQ_API_KEY` (or `OPENROUTER_API_KEY`), and —
if you use the multi-shop cloud sync — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
`DUKAN_MAX_DELIVERY_KM=5` is already set.

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

> ⚠️ `SUPABASE_SERVICE_KEY` is the all-powerful **service-role** key. It belongs
> **only** here, on the server. It never goes in the frontend or in git.
> Leave a key you don't use **commented out** — an exported *empty* variable
> blanks a real value.

---

## 7. Part 5 — Build the frontend and upload it (from your Mac)

The server has ~512 MB and must not run the Vite/TypeScript toolchain, so build
on your Mac. **Open a new terminal on your Mac** (not the server) in this repo:

```bash
./deploy/serv00/upload-frontend.sh <LOGIN>@<HOST> <DOMAIN>
```

This runs `npm run build` and copies `dist/` into
`domains/<DOMAIN>/public_nodejs/public/` on the server. That folder is served
**directly** by Serv00's web server (fast, doesn't touch Node). Same origin as
the API — which is exactly what the app needs, because it calls `/api/*` with
relative URLs.

If you prefer plain `scp`:

```bash
npm run build
scp -r dist/* <LOGIN>@<HOST>:domains/<DOMAIN>/public_nodejs/public/
```

---

## 8. Part 6 — Start it, and turn on HTTPS

Back in your **SSH** window:

```bash
devil www restart <DOMAIN>
```

Open **`http://<DOMAIN>`** in a browser. The POS should load and WhatsApp should
show **disconnected** (no session yet). Now grab the padlock:

```bash
devil www options <DOMAIN> sslonly on
```

Then in the panel: **WWW websites → Details → SSL**, issue a free Let's Encrypt
certificate for `<DOMAIN>` if it isn't already there. Reload
**`https://<DOMAIN>`** — green padlock.

> ⚠️ **Don't skip this step.** The keep-alive cron (Part 7) pings
> `https://<DOMAIN>/api/status`, so the 24 h idle timer only keeps resetting
> once HTTPS works. If SSL isn't ready yet, leave `sslonly off` until it is or
> the site will redirect loop — but come back and finish it.

---

## 9. Part 7 — Keep-alive (already done, verify)

`setup.sh` installed this cron. Confirm on the server:

```bash
crontab -l | grep dukaan-keepalive
```

You should see (`fetch` is FreeBSD's `curl`):

```
*/10 * * * * /usr/bin/fetch -q -T 30 -o /dev/null https://<DOMAIN>/api/status # dukaan-keepalive
```

This is what makes Serv00 effectively always-on. **Belt-and-suspenders:** also
add the URL to a free external pinger (e.g. **https://cron-job.org**) every
5 minutes. Two independent pingers means the site is never idle for 24 h.

---

## 10. Part 8 — Link WhatsApp (scan the QR)

The bot logs to stdout, which Serv00 captures in the website's log file:

```bash
tail -f ~/domains/<DOMAIN>/logs/error.log
```

Or just open **`https://<DOMAIN>` → Settings → WhatsApp** in the browser — the
QR is shown there. On your phone: **WhatsApp → Settings → Linked devices →
Link a device** → scan it. (If the ASCII QR won't scan, use **"Link with phone
number"** and type the 8-digit code.)

The session is saved to `whatsapp/auth_info/` on the server, so it survives
restarts and won't ask again.

---

## 11. Part 9 — Prove it works (do ALL of these before 20 Oct)

| # | Check | How | Pass |
|---|---|---|---|
| 1 | Site loads | open `https://<DOMAIN>` | POS dashboard, green padlock |
| 2 | API alive | open `https://<DOMAIN>/api/status` | JSON `{"status": ...}` |
| 3 | Bot linked | Settings → WhatsApp | shows **Connected** |
| 4 | Order in | send a WhatsApp order to the linked number | appears in POS (≤2.5 s) |
| 5 | Order out | Accept it in the POS | customer gets the WhatsApp reply |
| 6 | Reboot-safe | resend an order after 15 min idle | still works (cron kept it awake) |

All six green = ready to demo.

---

## 12. Part 10 — Demo day (20 Oct)

- Give the judges **`https://<DOMAIN>`** — works on any phone or laptop, nothing
  to install.
- Keep a test WhatsApp number with a couple of orders ready.
- Screenshot `/api/status` + the green padlock as proof it's live.
- You can close your Mac — the bot runs on Serv00, not your laptop.

---

## 13. Part 11 — Updating the app later

On your Mac: edit, commit, `git push`. Then on the **server**:

```bash
cd ~/domains/<DOMAIN>/public_nodejs
git pull
cd whatsapp && npm ci --omit=dev && cd ..
devil www restart <DOMAIN>
```

If you changed the **frontend**, also re-run `./deploy/serv00/upload-frontend.sh`
from your Mac.

---

## 14. Troubleshooting

| Symptom | Fix |
|---|---|
| `502` / blank page | `devil www restart <DOMAIN>`; then check `~/domains/<DOMAIN>/logs/error.log` |
| `public/index.html missing` | you skipped Part 5 — upload the frontend build |
| App "stopped" after a quiet day | cron missing → re-run `setup.sh`, and add the external pinger (Part 7) |
| Bot shows disconnected | re-scan the QR (Part 8); check `whatsapp/.env` keys |
| Orders don't appear | check `whatsapp/.env` (Supabase URL/keys); open `/api/status` |
| `node: command not found` in cron | use full paths (the cron already uses `/usr/bin/fetch`) |
| `devil: command not found` | SSH again (setup adds `devil` to PATH); or use the panel |

---

## 15. Files in this folder

| File | Runs on | Purpose |
|---|---|---|
| `setup.sh` | Serv00 server | one-shot backend bootstrap (idempotent) |
| `app.js` | copied to server root | Phusion Passenger entry point |
| `upload-frontend.sh` | your Mac | build `dist/` + upload to `public/` |
| `README.md` | you | this guide |
