# DUKAAN.AI — PRODUCT & ENGINEERING CONTEXT

Working context for AI coding agents on this repository. Everything below
describes the code **as it exists today**. If reality and this file disagree,
the code wins — then fix this file.

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

### Operating context (why prioritisation is what it is)

Built for **Paradox Hacks 2026 (Breeze'26, Shiv Nadar University, supported by
Masters' Union)**. Prizes are in-kind; the target is 1st place. That means:
optimise for **demo reliability and visible AI adaptation** over architectural
ambition. A stable, demo-safe feature beats a clever one that can break live.

Judge focus areas: business viability, UX clarity, scalability potential,
visible AI adaptation, stability.

---

## 2. REPOSITORY MAP

```
dukaan.ai/
├── index.html                 Vite entry; Tailwind CDN + fonts + theme config
├── vite.config.ts             Dev server :3000, proxies /api & /events -> :5001
├── tsconfig.json              Scopes src/ + vite.config.ts (NOT whatsapp/)
├── supabase_schema.sql        Tables + Row Level Security policies
├── .env.example               Frontend env template
├── public/                    Static assets + i18n/locales/*.json
├── src/                       Shopkeeper POS
│   ├── App.tsx                Root view, hash routing, SSE order listener
│   ├── types.ts               Shared domain types (incl. `Screen`)
│   ├── supabase.ts            Supabase client + isSupabaseConfigured()
│   ├── components/            Modals, nav, cards, toasts
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
│   ├── dukanCatalog.js        Catalog sync with the POS
│   ├── dukanOrders.js         Order ledger & status transitions
│   ├── dukanShops.js          Shop registry
│   ├── store.js               JSON persistence layer
│   ├── audioTranscriber.js    Voice-note transcription (Groq)
│   ├── locationFetcher.js     Location pin -> address
│   ├── public/                QR pairing / status web UI
│   └── store/                 Runtime state: catalog, orders, chats, messages
├── scripts/                   Repo tooling & bot test harnesses
│   └── local-ai/              LoRA dataset generation + local model serving
└── data/                      LoRA training workspace (generate_dataset.py)
```

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

### Cloud (Supabase)
- `@supabase/supabase-js` ^2.117 — **Auth** (email/password + **Google OAuth**,
  PKCE flow) and **cloud sync** of profile, products and orders
- `src/supabase.ts` exposes the client and `isSupabaseConfigured()`. When env
  vars are absent, the app runs in **local-only guest mode**; every Supabase
  call is guarded by that check.
- `supabase_schema.sql` is the source of truth for tables and RLS policies.

> Firebase is **gone**. Do not reintroduce it or add an alternative backend.

### AI
- All model calls route through **OpenRouter** — `src/utils/openrouterClient.ts`.
  `src/utils/geminiClient.ts` is a one-line re-export shim kept for import
  compatibility; there is no direct Gemini integration.
- Used for: onboarding question generation, business-context inference,
  insights, and OCR bill parsing.

### WhatsApp engine
- **Node (>=20)** + **Express 5**
- **@whiskeysockets/baileys** ^7 (multi-device socket, persisted session in
  `whatsapp/auth_info/`)
- SSE broadcast of live order packets to the POS
- **Groq** for fast voice-note transcription; OpenRouter for conversation
- Reverse-geocodes shared location pins
- JSON store under `whatsapp/store/`

---

## 4. HOW THE PIECES TALK

```
WhatsApp customer
      │ message
      ▼
whatsapp/dukanBot.js ──(cart, payment, status)──> whatsapp/dukanOrders.js
      │                                                   │
      │ SSE  /events                                      │ writes
      ▼                                                   ▼
Vite dev server :3000 ──proxy /api + /events──> whatsapp/server.js :5001
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

## 5. FEATURE SET (WHAT EXISTS)

- Business-type **adaptive navigation** (`src/utils/tabResolver.ts`)
- **Onboarding flow** that captures store category, name, address, supplier
  details and business context
- **Dashboard / Sales / Orders / Catalog / Insights / Online Store / Settings**
- **Live order intake** over SSE with a new-order modal, swipe-to-accept,
  stock deduction and UPI QR payment
- **WhatsApp conversational ordering** with cart building, payment
  confirmation handling and order-status queries
- **Voice-note transcription** and **location-pin** order capture
- **OCR bill / supplier parsing** to seed the catalog
- **Multi-language UI** (7 locales)
- **Supabase auth + cloud sync** with guest fallback
- **Local LoRA tooling** under `scripts/local-ai/` (dataset → train → serve)

---

## 6. WORKFLOW RULES

### Verify before claiming done
```bash
npx tsc --noEmit     # must be silent
npm run build        # must succeed
```
Run both before any commit. For WhatsApp-engine changes also run:
```bash
cd whatsapp && node test_order_engine.js && node test_trigger_gate.js
```

### Change rules
- **Keep navigation keys stable.** `Screen` values are
  `DASHBOARD | SALES | ORDERS | CATALOG | SETTINGS`. Adapt *labels and icons*
  through `tabResolver` — never reorder, rename or add keys, and never add
  screens for a new business type.
- **Preserve `localStorage` key names** (`dukan-*`). They hold live shopkeeper
  state; renaming one silently loses user data.
- **Keep the port contract**: WhatsApp engine on **5001**, Vite on **3000**,
  proxied via `/api` and `/events`.
- **Surgical edits.** Match the surrounding style; leave unrelated code alone.
- **No new machinery** unless asked: no router, no state library, no extra
  backend, no test framework.
- **Type-check both sides** of a change that crosses POS ↔ engine.

### Secrets & safety
- `.env` and `whatsapp/.env` are gitignored — keep them that way.
- **Every `VITE_*` variable is inlined into the browser bundle.** Treat them as
  public. Never place a Supabase `service_role` key, a DB password or any
  private credential in a `VITE_*` var or in the source.
- Never commit `whatsapp/auth_info/` (WhatsApp session credentials) or
  `whatsapp/store/*.json` (contains customer names, phone numbers and
  addresses).
- Never commit model weights, `data/*.jsonl`, or `node_modules/`.
- Adding a backend feature means adding **RLS policies** to
  `supabase_schema.sql`, not widening the anon key's reach.

### Never (outdated habits from the pre-backend era)
- Don't hardcode API keys or project URLs as source fallbacks.
- Don't assume a static-hosting-only, client-only architecture. There is a
  backend now.
- Don't bypass `isSupabaseConfigured()` when touching the Supabase client.

---

## 7. COMMANDS

```bash
# Frontend
npm install
npm run dev            # :3000
npm run build
npm run preview
npm run deploy         # build + gh-pages

# WhatsApp engine
cd whatsapp && npm install
npm start              # :5001
npm run dev            # node --watch

# WhatsApp engine tests
cd whatsapp && node test_order_engine.js
cd whatsapp && node test_trigger_gate.js

# Terminal chat client (replaces the phone for local testing)
npm run terminal-chat

# Local AI (LoRA)
python data/generate_dataset.py
bash scripts/local-ai/mlx_train.sh
bash scripts/local-ai/run_server.sh
```

---

## 8. SUCCESS CRITERIA

Code is acceptable when it:

- Compiles with **zero TypeScript errors** and builds cleanly
- Renders adaptive navigation correctly for every business type
- Preserves the order lifecycle end-to-end
- Produces **zero runtime/console errors**
- Loads in under ~2s and works on mobile viewports
- Adds no new dependency or architecture without a stated reason

---

## 9. KNOWN OPEN ITEMS

- `supabase_schema.sql` uses permissive `USING (true)` policies (profiles,
  products, orders). Harden with owner-scoped RLS before any real deployment.
- `@google/genai` is still a dependency but no longer imported directly —
  removable.
- `src/screens/LoginScreen.tsx` appears orphaned (auth now flows through
  `AuthModal`).
- `data/*.jsonl` are gitignored and regenerable via
  `data/generate_dataset.py`.
- Keep this file in sync when the stack, scripts or rules change.
