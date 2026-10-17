# Dukaan.AI — deploy guide (Wispbyte VPS + Vercel)

Written for someone who has never deployed anything. Every step says **what to
click** and **what you should see**. Nothing here needs the command line.

---

## 0. What you are building

```
        shopkeeper's laptop                    customer's phone
                 │                                     │
                 │ opens the app                       │ texts the store
                 ▼                                     ▼
      ┌──────────────────────┐                ┌──────────────────────┐
      │   VERCEL (free)      │                │  WhatsApp (Baileys)  │
      │   the POS app        │                │  the AI order taker  │
      │   + /api + /events   │                └──────────┬───────────┘
      └──────────┬───────────┘                           │
                 │ reverse-proxies /api and /events      │
                 ▼                                       ▼
      ┌────────────────────────────────────────────────────────────┐
      │   WISPBYTE VPS (free, 24/7)                                │
      │   1 vCPU · 512 MiB RAM · 1 GiB disk                        │
      │   whatsapp/server.js — one Node process, one port (16232)  │
      └────────────────────────────────────────────────────────────┘
                 ▲
                 │ push to main  →  CI runs tests  →  Vercel redeploys
                 │                              →  Action restarts the VPS
```

**Why this shape?** The app calls its backend with same-origin URLs (`/api/...`).
Vercel therefore *reverse-proxies* `/api` and `/events` to the VPS. The browser
never sees a cross-origin call, so there is no CORS work and no mixed-content
block. (Your Vite dev server already does exactly this proxy locally.)

**What is deliberately NOT in scope:** the landing page. You are building that
separately — this guide only deploys the POS app + the bot.

---

## 1. Before you start (5 minutes)

| You need | Where | Notes |
|---|---|---|
| A GitHub account | github.com | the repo must be pushed there |
| A Vercel account | vercel.com | sign in **with GitHub** — no card needed |
| Your Wispbyte server | panel | already created ("Dukaan") |
| Your Supabase project | supabase.com | for Google sign-in + cloud sync |

Write down two numbers you will paste later:

| Value | Where to find it | Yours |
|---|---|---|
| VPS host | panel → server → **Address** | `78.154.103.13` |
| VPS port | the number after the `:` in that Address | `16232` |

> The address `78.154.103.13:16232` is both what the browser uses and the port
> the bot listens on. If it ever changes, you update **one line** in
> `vercel.json` (Part 4).

---

## 2. Put the code on `main`

Everything below triggers off the **`main`** branch, so the work must land there.

1. Open the repository on GitHub → **Pull requests** → **New pull request**.
2. Set **base: `main`** ← **compare: `deploy/wispbyte`**.
3. Wait for the **CI** checks at the bottom to turn green (about a minute).
   - Green = both suites passed. **Red = do not merge**, tell me.
4. Click **Merge pull request**.

You should now see the deploy files on `main`:
`vercel.json`, `.github/workflows/ci.yml`, `.github/workflows/deploy-backend.yml`,
`deploy/wispbyte/`.

---

## 3. Backend — Wispbyte

The free tier has **no SSH and no SFTP**. Everything is done in the panel, and
the **Console** is how you watch what the server is doing.

### 3a. Make Node the server type

Server → **Startup** (the page that shows *Startup Command*, *Docker Image*,
*Server Configuration*).

1. **Docker Image** → choose the **Node.js** image (any recent version).
2. Leave *NODE_PACKAGES* and *JS_FILE* alone for now — 3d overrides them.

### 3b. Point it at GitHub — "Repository Settings"

Server → **General** → **Repository Settings** (the page with *Clone* / *Pull*):

| Field | Value |
|---|---|
| Repository URL | `https://github.com/dishudhalwal12/dukaan.ai` |
| Branch | `main` |
| Authentication | **leave blank** — the repo is public |

Click **Clone**. Wait for the file list to fill in.

### 3c. Options

On the same page (*Options* section):

| Toggle | Set to |
|---|---|
| **Auto Update on Startup** | **ON** |
| **Skip Install on Upload** | OFF |
| **Startup File** | `whatsapp/server.js` |

### 3d. The Startup Command — copy/paste

Open `deploy/wispbyte/startup-command.sh` on GitHub, click **Raw**, select
everything, copy it. Paste it into the **Startup Command** box, replacing what is
there. Save.

That one block is the whole process manager. On every start it prints the Node
version, the git revision and free disk, pulls the latest code, installs the
bot's dependencies **only when the lockfile changed**, caps the heap so 512 MiB
is never exceeded, then starts the bot.

### 3e. Secrets — "Server Configuration" (environment variables)

Click **Add variable** for each row. These are the **only** place secrets live:
`whatsapp/.env` is not in the repository, so a file-based config would be lost.

| Variable | Value | Required? |
|---|---|---|
| `PORT` | `16232` | **yes** |
| `GROQ_API_KEY` | your Groq key | one AI provider is required |
| `GROQ_MODEL` | your Groq model | optional |
| `OPENROUTER_API_KEY` | your OpenRouter key | — |
| `OPENROUTER_MODEL` | `liquid/lfm-2.5-2.6b:free` | optional |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | for multi-shop routing |
| `SUPABASE_SERVICE_KEY` | Supabase **service_role** key | for multi-shop routing |
| `DUKAN_MAX_DELIVERY_KM` | `5` (default) | optional |

> ⚠️ Two traps, both real:
> 1. **Do not create a variable and leave it empty.** The bot treats an *empty*
>    variable as a real value, which blanks the real one. Only add the rows above.
> 2. Use the Supabase **service_role** key here, not the `anon` key. The bot is
>    server-side; the anon key reads nothing from these tables.
>
> Do **not** add `LLM_BASE_URL` — it points at a local model server that does
> not exist on the VPS.

### 3f. Start it

Click **Start**. Open **Console** and you should see, in order:

```
=== dukaan boot 2026-… ===
node    : v2x.x.x
revision: <7 characters>
disk    : … available
installing bot dependencies …        (only the first time)
starting bot on port 16232 …
```

Then the bot prints a WhatsApp QR block. **Leave it running.** Open
`http://78.154.103.13:16232/api/status` in a browser — you should get JSON like
`{"status":"qr_ready", …}`. That single URL proves the backend is alive.

---

## 4. Frontend — Vercel

1. vercel.com → **Add New… → Project** → **Import Git Repository** →
   `dukaan.ai` → **Import**.
2. Vercel detects **Vite** automatically. Leave *Build Command* (`npm run build`)
   and *Output Directory* (`dist`) as they are.
3. Open **Environment Variables** and add (these are baked into the browser
   bundle at build time — that is expected for `VITE_*`):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase **anon** key |
   | `VITE_OPENROUTER_API_KEY` | your OpenRouter key |
   | `VITE_OPENROUTER_MODEL` | `liquid/lfm-2.5-2.6b:free` |

4. Click **Deploy**. You get a URL like `https://dukaan-ai.vercel.app`.
5. **Confirm the proxy works** — visit `https://<your-url>/api/status`. You must
   see the same JSON the VPS returned. If instead you see a Vercel 404/502, see
   *Troubleshooting* below.
6. **Allow the sign-in redirect.** Supabase → **Authentication → URL
   Configuration** → add `https://<your-url>` (and `https://<your-url>/**`) to
   *Redirect URLs*. Without this, Google sign-in returns to the wrong place.

### Changing the VPS address later

`vercel.json` is the only file that hardcodes the VPS. If the IP or port changes,
edit both `destination` lines, commit to `main`, and Vercel redeploys itself.

---

## 5. CI/CD — make pushes deploy themselves

Vercel already redeploys on every push to `main` — nothing to configure.

For the **backend**, add three repository secrets
(GitHub → repo → **Settings → Secrets and variables → Actions → New repository
secret**):

| Secret | Where to get it |
|---|---|
| `WISPBYTE_PANEL_URL` | the panel's address, e.g. `https://panel.wispbyte.com` |
| `WISPBYTE_API_KEY` | panel → **Account → API Credentials → Create** |
| `WISPBYTE_SERVER_ID` | the short id in the panel URL of your server |

After that:

```
you push to main
   → CI runs both test suites
   → Vercel redeploys the app           (automatic)
   → deploy-backend.yml restarts the VPS (which pulls the new code)
```

The restart job only runs when files under `whatsapp/` changed, so a frontend
tweak never drops the WhatsApp session.

> If Wispbyte does not expose API credentials on the free plan, the workflow
> prints a warning and does nothing — then a backend deploy is: panel →
> **Restart**. Same result, one click.

---

## 6. Link WhatsApp

The bot starts disconnected and shows a QR code.

1. Open the Vercel URL → **Settings → WhatsApp**.
2. Scan the QR with the business phone (**Settings → Linked devices →
   Link a device**).
3. The status pill turns **Connected**.

The session is stored on the VPS in `whatsapp/auth_info/`, so it survives
restarts and redeploys. You only scan once. (If the VPS is ever rebuilt from
scratch, scan again.)

---

## 7. Acceptance checklist (do this before the demo)

Tick every line. If one fails, jump to *Troubleshooting* — do not demo on a
half-wired system.

- [ ] `http://<VPS>:16232/api/status` returns JSON.
- [ ] `https://<vercel-url>/api/status` returns the **same** JSON (proxy line works).
- [ ] `https://<vercel-url>/` loads the POS app.
- [ ] Google sign-in completes and returns to the Vercel URL.
- [ ] The WhatsApp pill shows **Connected**.
- [ ] Send the store a WhatsApp message from another phone → an order appears in
      the POS **and the chime plays** (this is the SSE path).
- [ ] Accepting that order sends a WhatsApp confirmation back to the customer.
- [ ] Panel **Console** is still printing heartbeats and shows no red errors.

---

## 8. Measured performance (stress test)

Run locally through the **same proxy hop** production uses:

```
./deploy/wispbyte/stress/run.sh
CLIENTS=25 SOAK_S=600 BURST_TOTAL=20000 ./deploy/wispbyte/stress/run.sh
```

| Metric | Result |
|---|---|
| Cold start → first `/api/status` | ~1 s |
| 3 000 mixed requests @ 50 concurrent | 100 % success, **3 254 req/s** |
| Heavy soak burst (20 000 @ 100 concurrent) | 100 % success, **5 468 req/s** (3.66 s) |
| Heavy soak sustained (25 clients, 10 min) | 1 275 msgs, 0 errors |
| Burst latency p95 / p99 | 37 ms / 46 ms |
| Heavy soak latency p95 (burst / sustained) | 32.7 ms / 21.4 ms |
| Sustained latency p95 (5 clients, 60 s) | 25 ms |
| SSE stream through the proxy | connected, 0 errors |
| Bot RSS idle → peak under load | 21 MB → **139 MB** (27 % of the 512 MiB box) |
| Bot RSS over 10-min soak (first / peak / last) | 4 MB → 184 MB → 23 MB (36 % of 512 MiB; no growth) |
| Disk used on the box | ~70 MB of 1 GiB |
| Shopkeeper clients | each costs **~0 MB extra RAM** — the bot is a relay |

The bot is a **relay**: inference runs remotely and browsers are cheap. The real
ceiling is one WhatsApp session, not server capacity — so a shop can have many
shopkeepers and customers without the VPS noticing.

**About "24/7":** Wispbyte keeps free servers online continuously; the only
condition is that **you log into the panel at least once a month** (otherwise the
server is archived, not deleted, and comes back when you return). There is *no*
idle shutdown to defeat — unlike shared hosts, no keep-alive cron is needed.

The soak test proves the *software* half: no memory growth over a sustained
10-minute soak and clean SSE reconnects. The *host* half is Wispbyte's policy.

---

## 9. Day-2 operations

| Task | How |
|---|---|
| Ship a change | push to `main`. Vercel redeploys; the Action restarts the VPS |
| Restart the bot by hand | panel → **Restart** |
| Read logs | panel → **Console** (scroll back) |
| Change a secret | panel → **Server Configuration** → edit → **Restart** |
| Keep it alive | log into the Wispbyte panel **once a month** |
| Rotate a leaked key | change it in the panel **and** in Vercel, then restart / redeploy |

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `https://<vercel>/api/status` → Vercel 404 or 502 | the proxy cannot reach the VPS, or Vercel refused the plain-`http` destination | confirm `http://<VPS>:16232/api/status` works in the same browser; if it does, the proxy is the problem — tell me and we switch the app to be served directly by the VPS (same origin, no proxy) |
| Console loops on QR codes | nobody scanned it | scan it (Part 6) |
| Console: `Cannot find module` | the install step was skipped | panel → **Restart** (the startup command reinstalls) |
| Orders appear but **no chime** | the SSE stream is not reaching the browser | the order list still updates (2.5 s poll), so the demo keeps working; check `https://<vercel>/events` stays open — a proxy that buffers breaks SSE |
| Bot replies `I can't reach the store directory` | no `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | add both in **Server Configuration**, restart |
| Bot refuses every order | no shop within `DUKAN_MAX_DELIVERY_KM` of the customer's pin | widen the radius, or move the store/pin |
| Keys you typed into the POS settings screen vanish | that screen writes to a file the VPS never reads | always set keys in **Server Configuration** |
| Vercel build fails on `npm ci` | lockfile drift | run `npm install` locally, commit the updated `package-lock.json` |
