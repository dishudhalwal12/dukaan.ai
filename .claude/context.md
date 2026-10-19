# DUKAAN.AI — PRODUCT & ENGINEERING CONTEXT

Working context for AI coding agents and for anyone debugging production.
Everything below describes the code **as it exists today**. If reality and this
file disagree, the code wins — then fix this file.

Last reviewed: 2026-10-20.

---

## 1. WHAT THE PRODUCT IS

Dukaan.AI is an **AI-adaptive commerce OS** for Indian small businesses, built
and demoed on top of a grocery/Kirana POS.

The same codebase serves several business types — Grocery/Kirana, Salon,
Restaurant, Chemist, and an AI-determined "Other" — by adapting navigation
labels, catalog presets and AI behaviour to the business category captured
during onboarding.

Two surfaces ship together:

1. **Shopkeeper POS** — a mobile-first React app (dashboard, sales, orders,
   catalog, settings, insights, online store).
2. **WhatsApp ordering engine** — customers order by messaging a WhatsApp
   number the shopkeeper links; orders land live in the POS.

### Operating context

Built for **Paradox Hacks 2026 (Breeze'26, Shiv Nadar University, supported by
Masters' Union)**. Optimise for **demo reliability and visible AI adaptation**
over architectural ambition. A stable, demo-safe feature beats a clever one that
can break live.

---

## 2. REPOSITORY MAP

```
dukaan.ai/
├── index.html                 Vite entry; fonts, theme, favicon/OG metadata
├── vite.config.ts             Dev server :3000, proxies /api & /events -> :5001
├── tsconfig.json              Scopes src/ + vite.config.ts (NOT whatsapp/)
├── vercel.json                Static build + pinned VITE_API_BASE (no rewrites)
├── .env.example               The one environment template for the whole app
├── README.md                  Single canonical setup/product guide
├── SECURITY.md                GitHub security policy
├── .claude/context.md         This file: context, incident log, runbook
├── .github/workflows/         ci.yml (quality gate) + deploy-backend.yml (legacy)
├── public/                    Static assets + i18n/locales/*.json
│   ├── logo.png               1024x1024 app mark
│   ├── favicon.ico            16/32/48 multi-size icon
│   ├── apple-touch-icon.png   180x180
│   ├── icon-192.png            PWA icons
│   ├── icon-512.png
│   ├── og-image.png           1200x630 X / Open Graph card
│   └── site.webmanifest
├── src/                       Shopkeeper POS
│   ├── App.tsx                Root view, hash routing, SSE order listener
│   ├── types.ts               Shared domain types (incl. `Screen`)
│   ├── supabase.ts            Supabase client + isSupabaseConfigured()
│   ├── components/            Modals, nav, cards, toasts, SlideToConfirm
│   ├── contexts/              LanguageContext, ProductContext
│   ├── data/                  Kirana presets & seed data
│   ├── hooks/                 useBusinessLabel
│   ├── screens/               Dashboard, Sales, Orders, Catalog, Insights,
│   │                          Onboarding, OnlineStore, Settings + settings/
│   ├── services/              auth, cloudSync, ai, whatsappService, uploadService
│   └── utils/                 openrouterClient, tabResolver, parsers, audioAlert, …
├── whatsapp/                  WhatsApp engine (Node + Express, :5001)
│   ├── server.js              HTTP + SSE broadcaster + inbound event pipeline
│   ├── dukanBot.js            Conversation handler, cart/payment parsing
│   ├── dukanCatalog.js        Catalog sync + stock gating
│   ├── dukanOrders.js         Order ledger & status transitions
│   ├── dukanShops.js          Shop registry
│   ├── corsPolicy.js          Exact-match CORS allowlist (first-party origins)
│   ├── aiProxy.js             Server-side model proxy (keys stay here)
│   ├── apiAuth.js             Supabase token verification for every API route
│   ├── store.js               JSON persistence layer
│   ├── audioTranscriber.js    Voice-note transcription (Groq)
│   ├── locationFetcher.js     Location pin -> address
│   ├── public/                QR pairing / status web UI
│   ├── store/                 Runtime state (gitignored; live orders/chats)
│   └── test_*.js              Engine, CORS, proxy, pipeline and stress tests
├── scripts/                   Repo tooling & test harnesses
│   ├── local-ai/              LoRA dataset generation + local model serving
│   ├── check-secrets.mjs      Fails the build if a secret reaches dist/
│   ├── terminal_chat.js
│   └── test_*.js
├── supabase/
│   ├── schema.sql             Tables + RLS policies (fresh installs)
│   ├── email_confirmation.sql RPC used by the confirmation status endpoint
│   ├── fix_signup.sql         Repair script for older signup rows
│   ├── migrations/            Idempotent, non-destructive migrations (date order)
│   └── functions/             Edge Functions: capture-session, email-confirmation-status
└── deploy/
    ├── README.md              Current topology, day-2 ops, security, rollback
    ├── laptop/                update.sh, harden.sh, reconnect.sh, migrate-env.sh
    └── wispbyte/              Legacy VPS startup script (not in the live path)
```

SQL is applied **by hand** in the Supabase SQL Editor. There is no automatic
migration runner.

---

## 3. CURRENT STACK

### Frontend (Shopkeeper POS)
- **React 19.1** + **TypeScript 5.8** (`strict`)
- **Vite 6.4** — dev server on **:3000**
- **Tailwind CSS via CDN** (`cdn.tailwindcss.com`) with the theme configured
  inline in `index.html`; Material Symbols icons + Google Fonts
- **State**: React Context (`ProductContext`, `LanguageContext`) + local
  component state. No Redux/Zustand, no router.
- **Persistence**: `localStorage` under `dukan-*` keys
- **Live updates**: `EventSource` (SSE) subscribed to the WhatsApp engine
- **i18n**: 7 locales — `en, hi, gu, kn, pa, ta, ur` — fetched at runtime from
  `public/i18n/locales/<lang>.json` through `LanguageContext`'s `t()`
- **Audio**: Web Audio API, synthesized chime (no sound assets)
- **Branding**: `public/logo.png`; favicon, Apple icon, PWA manifest and a
  1200x630 OG/X card are generated from it. `index.html` points OG image URLs at
  the canonical production origin.

### Cloud (Supabase)
- `@supabase/supabase-js` ^2.117 — **Auth** (email/password + **Google OAuth**,
  PKCE flow) and **cloud sync** of profile, products and orders
- `src/supabase.ts` exposes the client and `isSupabaseConfigured()`. When env
  vars are absent, the app runs in **local-only guest mode**; every Supabase
  call is guarded by that check.
- `supabase/schema.sql` is the source of truth for tables and RLS policies.

> Firebase is **gone**. Do not reintroduce it or add an alternative backend.

### AI
- The browser calls the bot's proxy at **`/api/ai/chat/completions`**
  (`src/utils/openrouterClient.ts`). The bot holds the provider key in its root
  `.env` and forwards to OpenRouter/Groq (`whatsapp/aiProxy.js`).
- Used for: onboarding question generation, business-context inference,
  insights, and OCR bill parsing.
- `src/utils/geminiClient.ts` is a compatibility shim; there is no direct Gemini
  integration in the browser. Provider keys must **never** be `VITE_*`.

### WhatsApp engine
- **Node (>=20)** + **Express 5**
- **@whiskeysockets/baileys** ^7 (multi-device socket, persisted session in
  `whatsapp/auth_info/`)
- SSE broadcast of live order packets to the POS
- **Groq** for fast voice-note transcription; OpenRouter for conversation
- Reverse-geocodes shared location pins
- JSON store under `whatsapp/store/`

---

## 4. PRODUCTION TOPOLOGY

There is **no VPS in the live path**. The bot is self-hosted.

| Piece | Where |
|---|---|
| Frontend | Vercel — `https://dukaan-ai-hypnexis.vercel.app` |
| Old frontend alias | `https://dukaan-ai-beta.vercel.app` → 307 redirect |
| API / SSE | ngrok → `https://aurelio-chasmy-dorsiventrally.ngrok-free.dev` |
| Bot host | laptop `beyou@192.168.29.202` (Debian 12 / Q4OS, ~3.4 GB RAM) |
| Services | systemd `dukaan-bot`, `ngrok` |
| Database / auth | Supabase (`glkzpygjodhnmtlxejzg`) |
| Deploy tool | `./deploy/laptop/update.sh` |
| Repo | `dishudhalwal12/dukaan.ai` |

The browser loads the static POS from Vercel, then calls the ngrok origin
directly for `/api/*` and `/events` using `VITE_API_BASE` pinned in
`vercel.json`. Vercel has **no rewrites and no functions** by design.

### Why CORS is written in code

`dukaan-ai-beta.vercel.app` **307-redirects** to `dukaan-ai-hypnexis.vercel.app`.
A browser evaluates CORS against the URL it lands on, not the one the user
typed. If the allowlist only contains the beta alias, every preflight from the
final origin fails with 401 even though the beta preflight passes.

`whatsapp/corsPolicy.js` therefore keeps both first-party origins in
`FIRST_PARTY_ORIGINS`, and `whatsapp/server.js` unions them with
`CORS_ORIGINS` from the environment. `whatsapp/test_master_stress.js` resolves
the final URL after the redirect and preflights with **that** origin.

**Do not remove a first-party origin from that array**, and do not replace the
exact-match check with a suffix/`includes` test.

### Deploying backend changes

Merging to `main` does **not** update the laptop. `.github/workflows/deploy-backend.yml`
targets the legacy Wispbyte VPS and its restart step is skipped because the
`WISPBYTE_*` secrets are unset.

To ship backend code:

```bash
./deploy/laptop/update.sh --check          # read-only health check
ALLOW_DELETIONS=1 ./deploy/laptop/update.sh
```

`update.sh` builds locally (the secret guard runs as `postbuild`), dry-runs
deletions and refuses unexpected ones, snapshots to `~/dukaan.ai.bak`, syncs,
restarts only `dukaan-bot`, verifies the security contract on the box and
through the tunnel, and restores the snapshot if a check fails. It never syncs
`.env`, `whatsapp/auth_info/`, `whatsapp/store/`, `node_modules/` or `.git`.

Because `.git` is excluded, the laptop's `git rev-parse` is **not** a reliable
record of deployed code. Verify behaviour (preflight, `/api/status`, tests), not
the remote HEAD.

Full runbook: `deploy/README.md`.

---

## 5. HOW THE PIECES TALK

```
WhatsApp customer
      │ message
      ▼
whatsapp/dukanBot.js ──(cart, payment, status)──> whatsapp/dukanOrders.js
      │                                                   │
      │ SSE  /events                                      │ writes
      ▼                                                   ▼
Vercel / Vite :3000 ──/api + /events──> whatsapp/server.js :5001
      │                                                   │
      ▼                                                   ▼
src/App.tsx (EventSource)                          whatsapp/store/*.json
      │
      ├──> ProductContext  (orders, products, cart)
      ├──> cloudSync       (Supabase, when configured)
      └──> localStorage    (always)
```

Navigation is **hash-driven state**, not a router: `App.tsx` maps
`#orders`, `#sales`, `#catalog`, `#settings`, `#dashboard` onto the `Screen`
enum.

---

## 6. FEATURE SET (WHAT EXISTS)

- Business-type **adaptive navigation** (`src/utils/tabResolver.ts`)
- **Onboarding flow**: name → language → store details → AI business questions
  (language chosen before any question is shown)
- **Dashboard / Sales / Orders / Catalog / Insights / Online Store / Settings**
- **Live order intake** over SSE with a new-order modal, physics-based
  swipe-to-accept, stock deduction and UPI QR payment
- **WhatsApp conversational ordering** with cart building, payment
  confirmation handling and order-status queries
- **Voice-note transcription** and **location-pin** order capture
- **OCR bill / supplier parsing** to seed the catalog
- **Multi-language UI** (7 locales) with localized first-load insight fallbacks
- **Supabase auth + cloud sync** with guest fallback
- **Local LoRA tooling** under `scripts/local-ai/` (dataset → train → serve)

---

## 7. ENGINEERING LOG — COMPLETED WORK (OCTOBER 2026)

Each entry is symptom → root cause → fix → proof, so a recurrence can be
recognised quickly.

### 7.1 Order pipeline and popup reliability

- **Symptoms:** orders stopped appearing; popups were suppressed; swipe-to-accept
  lagged or missed.
- **Cause/fix:** the order listener and modal queue in `src/App.tsx` were
  reworked so a new order is shown immediately and the slide control is
  physics-based rather than animation-bound. Commits `3176ef9` (SlideToConfirm)
  and `503914d` (instant popup, no swipe lag).
- **Proof:** `npm run stress` live suite, including a WhatsApp message → POS
  order → accept → confirmation round trip.

### 7.2 Onboarding sequence and localization

- **Symptoms:** language was chosen too late, questions appeared in the wrong
  language, and first-load insights stayed English.
- **Fix:** onboarding is now **name → language → store details → business
  questions**. Question generation asks the model for the chosen language and
  starts a localized fallback set immediately, then replaces it when the AI
  response arrives. Commit `dc10e77`.
- **Files:** `src/screens/OnboardingFlow.tsx`,
  `src/data/onboardingQuestions.ts`, `src/contexts/LanguageContext.tsx`.
- **Proof:** `scripts/test_ui_fixes.js`, `scripts/test_locale_usage.js`.

### 7.3 Insights language on first load

- **Symptoms:** a new device rendered insights in English even after the account
  language loaded.
- **Cause:** the generation effect ran before the locale bundle was ready; a
  language change could also re-run against the previous bundle.
- **Fix:** `ProductContext` gates generation on `languageReady &&
  translationsLanguage === language`, and retries the English fallback fetch
  until the bundle is loaded.
- **Proof:** `scripts/test_ui_fixes.js` and manual first-load check in a fresh
  browser profile.

### 7.4 Zero-stock catalog gate

- **Symptom:** a product with `stock: 0` could still be added to a WhatsApp cart.
- **Cause:** the exact-name shortcut in `whatsapp/dukanCatalog.js` bypassed the
  in-stock filter used by normal search.
- **Fix:** the shortcut now returns only products whose numeric `stock > 0`
  (products without a numeric stock keep their explicit `inStock` flag).
- **Proof:** `whatsapp/test_catalog_gate.js` (T3 suite).

### 7.5 Unconfirmed signup / null identity

- **Symptoms:** an unconfirmed session triggered a reload under the auth popup;
  identity rows could be created with blank names.
- **Fix:** `a6769ae` stops an unconfirmed null session from reloading; signup
  requires a full name and writes identity fields atomically.
- **Proof:** `scripts/test_auth_confirmation.js`, `scripts/test_cloud_rows.js`.

### 7.6 `signup_at` NOT NULL failure

- **Symptom:** identity upsert returned HTTP 400 because `signup_at` was NOT
  NULL but omitted from the payload.
- **Fix:**
  - `src/utils/cloudRows.ts` mirrors `auth.users.created_at` into `signup_at`.
  - `src/services/cloudSync.ts` skips the identity write when there is no
    session (the signup trigger owns the row in that case).
  - `supabase/migrations/2026-10-19_null_integrity.sql` adds a `now()` default
    and the `NOT NULL` constraint.
  - Commit `4ae67d5`, merged as `ab3aefc` (PR #17).
- **Proof:** `scripts/test_cloud_rows.js` asserts `signup_at`.

### 7.7 Production CORS outage after the Vercel domain change

- **Symptoms:** AI insights and POS AI stopped loading; every `/api` and
  `/events` call from the new domain returned 401 on preflight.
- **Cause:** the Vercel project moved to `dukaan-ai-hypnexis.vercel.app` and the
  beta URL 307-redirects. The backend allowlist only knew the beta origin, so
  the browser blocked the final origin.
- **Fix:** `whatsapp/corsPolicy.js` defines both first-party origins;
  `whatsapp/server.js` unions them with `CORS_ORIGINS`;
  `whatsapp/test_master_stress.js` preflights the final origin after the
  redirect. Commits `52c3cfe` / `98ef8b8`, merged as `32e54db` (PR #16).
- **Deployment:** because the backend is the laptop, the fix was shipped with
  `ALLOW_DELETIONS=1 ./deploy/laptop/update.sh` on 2026-10-20, not by the
  Wispbyte workflow. Result: `OPTIONS /api/ai/chat/completions` from hypnexis
  returns **204 + Access-Control-Allow-Origin**, and the live stress suite is
  15/15.

> Auth-gated routes still answer 401 when there is no Supabase session. That is
> authentication, not CORS. CORS is only the problem when the **preflight**
> (`OPTIONS`) lacks `Access-Control-Allow-Origin`.

### 7.8 CI fixes

- `ci.yml` installs the bot's dependencies before `stress:hermetic`; a clean
  runner previously failed on `ERR_MODULE_NOT_FOUND: dotenv`.
- CI runs 16 frontend suites, `tsc --noEmit`, hermetic stress, and the build
  with the secret guard. Backend runs its unit suite plus 1,400 reliability
  scenarios.
- Main is PR-only. A red CodeQL check blocks merge; avoid URL substring
  sanitization patterns in tests (assert through the exact-match helper).

### 7.9 Repository structure and branding

- Consolidated SQL into `supabase/` (`schema.sql`, `email_confirmation.sql`,
  `fix_signup.sql`, `migrations/`) and removed the duplicate legacy
  `data/generate_dataset.py` (the active generator is
  `scripts/local-ai/generate_dataset.py`).
- Removed the stale `whatsapp/README.md` and merged both deploy guides into
  `deploy/README.md`. The legacy Wispbyte guide described a proxy/keys-in-bundle
  setup that no longer exists.
- Added the app logo to `public/` and generated favicon, Apple touch icon, PWA
  icons, manifest, and the 1200x630 OG/X card from it. `index.html` carries the
  icon + social metadata.

---

## 8. VERIFICATION & COMMANDS

### Before any commit

```bash
npm test                    # 16 frontend/repo suites
npx tsc --noEmit            # must be silent
npm run stress:hermetic     # 10-checkpoint hermetic suite
npm run build               # build + secret guard
cd whatsapp && npm test     # bot suites
```

### Live checks (production wired)

```bash
npm run stress              # 15-checkpoint live suite
curl -s https://aurelio-chasmy-dorsiventrally.ngrok-free.dev/api/status
```

CORS preflight, from the canonical origin:

```bash
curl -i -X OPTIONS \
  https://aurelio-chasmy-dorsiventrally.ngrok-free.dev/api/ai/chat/completions \
  -H 'Origin: https://dukaan-ai-hypnexis.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization,ngrok-skip-browser-warning'
```

Expect `204` and an `Access-Control-Allow-Origin` header. A 401 with no ACAO
means the origin is not allowed; a 401 **with** ACAO means the origin is fine
and the request simply has no session token.

### Deploying

```bash
./deploy/laptop/update.sh --check
ALLOW_DELETIONS=1 ./deploy/laptop/update.sh
```

### Other useful commands

```bash
npm run dev                                # POS on :3000
cd whatsapp && npm start                   # bot on :5001
npm run terminal-chat                      # chat with the bot, no WhatsApp
cd whatsapp && npm run test:reliability    # 1,400 pipeline scenarios
python3 scripts/local-ai/generate_dataset.py
```

`npm run deploy` no longer exists. There is no gh-pages publish path.

---

## 9. CHANGE RULES

### Verify before claiming done
Run the section 8 gates. For WhatsApp-engine changes also run the bot suite and
the catalog/CORS tests that touch the changed path.

### Keep stable
- **Navigation keys**: `DASHBOARD | SALES | ORDERS | CATALOG | SETTINGS`. Adapt
  labels/icons through `tabResolver`; never reorder or rename keys.
- **`localStorage` keys** (`dukan-*`) hold live shopkeeper state. Renaming one
  silently loses user data.
- **Port contract**: bot on **5001**, Vite on **3000**, proxies `/api` and
  `/events`.
- **First-party CORS origins** and the exact-match check in `corsPolicy.js`.
- **`vercel.json`**: static `dist/` only; no rewrites/functions; keep
  `VITE_API_BASE` pointing at the ngrok origin.
- **API auth**: every `/api/*` route and `/events` requires a Supabase token;
  the owner is derived from it.

### Surgical edits
Match the surrounding style; leave unrelated code alone. No new router, state
library, backend or test framework without a stated reason.

### Secrets & safety
- `.env` is gitignored and machine-local. The laptop's copy is never synced.
- **Every `VITE_*` variable is inlined into the browser bundle.** Never put a
  service-role key, DB password or private credential there.
- Never commit `whatsapp/auth_info/` (session credentials) or
  `whatsapp/store/*.json` (customer names, phones, addresses).
- Never commit model weights, `data/*.jsonl`, or `node_modules/`.
- Adding a backend feature means adding **RLS policies** to
  `supabase/schema.sql`, not widening the anon key's reach.

---

## 10. INCIDENT RUNBOOK — FIRST 10 MINUTES

1. **Is the bot alive?**
   `curl -s https://aurelio-chasmy-dorsiventrally.ngrok-free.dev/api/status`
   → must return `"status":"connected"` (or `qr_ready` if the session dropped).
2. **Is the tunnel alive?**
   `./deploy/laptop/update.sh --check` checks both the box and the public URL.
3. **Is it CORS?**
   Run the preflight from section 8 from the canonical origin. `204` + ACAO
   means CORS is fine; no ACAO means the origin is missing from the allowlist
   or the running code is old.
4. **Is the laptop running the new backend code?**
   Check behaviour, not `git rev-parse` (the deploy excludes `.git`). If a
   backend fix is merged but preflight still fails, run `update.sh`.
5. **Is it auth?**
   A 401 on a normal request with ACAO present means no/expired Supabase
   session. Sign in again; do not change CORS.
6. **Is the tunnel the problem?**
   If the box answers `localhost:5001/api/status` but the public URL does not,
   restart `ngrok`, not the bot.
7. **Did the session drop?**
   `sudo journalctl -u dukaan-bot -n 100`; a QR may be waiting in
   `whatsapp/public/`. Re-pair with `deploy/laptop/reconnect.sh`; never delete
   `whatsapp/auth_info/` unless re-pairing is intended.
8. **Orders missing?**
   Confirm `whatsapp/store/orders.json` exists on the **laptop** (the dev copy
   is older), and that the SSE stream is open in the browser. The POS also polls
   every 2.5 s, so a broken SSE shows delayed orders rather than none.

---

## 11. KNOWN OPEN ITEMS

- **Manual Supabase migration pending:**
  `supabase/migrations/2026-10-19_null_integrity.sql` must be run in the
  Supabase SQL Editor against the live database. It is idempotent; its audit
  query should return 0. Until then the client-side `signup_at` fix and the
  SQL default are the protection.
- `supabase/schema.sql` uses permissive `USING (true)` policies in places.
  Harden with owner-scoped RLS before real multi-tenant deployment.
- `@google/genai` is still a dependency but no longer imported directly —
  removable.
- `src/screens/LoginScreen.tsx` appears orphaned (auth flows through
  `AuthModal`).
- The legacy Wispbyte workflow and `deploy/wispbyte/` are kept as a fallback
  only; they are not production.
- Keep this file in sync when the stack, scripts, topology or rules change.
