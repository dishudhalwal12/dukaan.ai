# Dukaan MCP ordering

One public MCP endpoint lets any MCP-capable AI client order from nearby Dukaan shops. WhatsApp stays as a channel; it is no longer the only one.

```
ChatGPT / Claude / Claude Code / OpenCode / Cursor / VS Code
                    │  MCP over HTTPS + OAuth 2.1
                    ▼
          https://mcp.dukaan.ai/mcp
             │            │
     Supabase Auth     Supabase DB
     (OAuth server)    (shops, catalog, orders)
             │            │
             └──────► merchant dashboard
                      (poll, accept, reject)
```

## What is implemented

| Phase | Status | Artifact |
|---|---|---|
| 0. OAuth setup and consent UI | Code done; project dashboard steps are external | `src/screens/OAuthConsentScreen.tsx`, `scripts/mcp/check_oauth_config.mjs` |
| 1. Schema, RLS, placement RPC | Done and tested on Postgres | `supabase/migrations/2026-10-26_mcp.sql` |
| 2. MCP server, auth gate, discovery | Done and tested | `mcp/`, `api/mcp.js` |
| 3. Read tools and geocoding | Done and tested | `mcp/tools.js`, `mcp/geo.js` |
| 4. Quote/order tools | Done and tested | `mcp/tools.js`, `mcp/orderRules.js` |
| 5. Dashboard integration | Done | `src/App.tsx`, `src/services/cloudSync.ts`, `src/screens/OnlineStoreScreen.tsx` |
| 6. Install page and docs | Done | `src/screens/ConnectScreen.tsx`, this file |
| 7. Hardening | Done (limits, kill switch, PII-safe logs) | `mcp/limits.js`, `mcp/logging.js` |
| 8. MCP App checkout card | Done; host support varies | `mcp-app/`, `mcp/apps/` |

External steps that need the Supabase and Vercel project owners are listed below. They cannot be performed from this repository alone.

### Live project state observed on 2026-10-25

- `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` returned **404**, so the OAuth 2.1 server is not enabled yet.
- `GET /rest/v1/business_profiles?select=mcp_enabled` returned **400 `42703`**, so `2026-10-26_mcp.sql` has not been applied to the live project yet.
- No Vercel token or database password is present in the repository environment, so the endpoint could not be deployed or migrated from here.

Everything in the table above is implemented and tested locally. The two live steps are the gate to a working public endpoint.


## 1. Supabase setup

1. Open **Authentication → OAuth Server**.
2. Enable OAuth 2.1 server.
3. Enable **dynamic client registration** so MCP clients can register themselves.
4. Switch JWT signing to asymmetric keys (RS256/ES256) and let the project publish JWKS.
5. Set **Site URL** to the app origin, e.g. `https://dukaan-ai-hypnexis.vercel.app`.
6. Set **Authorization Path** to `/oauth/consent`.
7. Add `https://dukaan-ai-hypnexis.vercel.app/oauth/consent` to the allowed redirect URLs if the dashboard asks for it.
8. Run `supabase/migrations/2026-10-26_mcp.sql` in the SQL editor.

To turn on one pilot shop after the migration:

```sql
update public.business_profiles
set mcp_enabled = true
where user_id = '<shop-owner-uuid>';
```

The shop must already have `store_lat`/`store_lng` captured with `gps` or `manual` (not `ip_approximate`).

Verify discovery:

```bash
MCP_PUBLIC_URL=https://mcp.dukaan.ai/mcp \
SUPABASE_URL=https://<project-ref>.supabase.co \
MCP_AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1 \
node scripts/mcp/check_oauth_config.mjs
```

The check must show `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `registration_endpoint`.

## 2. Vercel setup

Set these server-side environment variables on the project (never `VITE_`):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>
MCP_PUBLIC_URL=https://mcp.dukaan.ai/mcp
MCP_AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1
MCP_ENABLED=true
# optional, for better geocoding
GOOGLE_MAPS_API_KEY=
MCP_GEOCODER_PROVIDER=google
```

`VITE_MCP_URL` is build-time and is already pinned in `vercel.json`.

Point `mcp.dukaan.ai` at the Vercel project (or use the project's own domain and set `MCP_PUBLIC_URL` to that). The resource identifier in the discovery document must match the URL clients type, including `/mcp`.

`vercel.json` rewrites:

- `/mcp` → `/api/mcp?__route=/mcp`
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` → `/api/mcp`
- `/oauth/consent` and `/connect` → the SPA

The function performs no OAuth issuance. Supabase is the authorization server; the function only verifies bearer tokens and serves the RFC 9728 discovery document.

## 3. Enable a shop

1. Sign in to Dukaan as the shopkeeper.
2. Open **Online Store**.
3. Turn on **Sell on AI assistants**.
4. Set the delivery radius (1–10 km).
5. Use **Pause AI orders** when the shop is closed.

Only `mcp_enabled = true` shops with a real `store_lat`/`store_lng` are discoverable. Shops whose location source is `ip_approximate` are excluded.

## 4. Connect a client

The public endpoint is `https://mcp.dukaan.ai/mcp`.

| Client | How |
|---|---|
| ChatGPT | Settings → Connectors → Advanced → Developer mode → Create → paste URL → OAuth |
| Claude | Settings → Connectors → Add custom connector → paste URL → OAuth |
| Claude Code | `claude mcp add --transport http dukaan https://mcp.dukaan.ai/mcp` |
| Cursor | `~/.cursor/mcp.json` with `{ "mcpServers": { "dukaan": { "url": "..." } } }` |
| VS Code | `.vscode/mcp.json` with `{ "servers": { "dukaan": { "type": "http", "url": "..." } } }` |
| OpenCode | `opencode.json` with `{ "mcp": { "dukaan": { "type": "remote", "url": "..." } } }` |
| stdio-only clients | `npx mcp-remote https://mcp.dukaan.ai/mcp` |

The `/connect` page carries the same snippets with copy buttons.

## 5. Tool flow

1. `find_shops` — saved address, pincode, area, or lat/lng. Never guesses.
2. `search_products` — authoritative price, unit, stock.
3. `quote_order` — 10-minute price lock; returns a quote ID and total.
4. Read back items, total, and full address; ask for a clear yes.
5. `place_order` — requires `quote_id` and `confirmed: true`.
6. `get_order` / `list_orders` / `cancel_order` — customer status.

`show_checkout` returns an MCP App checkout card for hosts that support MCP Apps. Hosts that do not render it receive the same summary as text; the model still uses `place_order`.

Prices are computed in integer paise from the shop's catalog. The model cannot set a price, a total, or a different basket at placement time.

## 6. Location handling

| Source | Accuracy | Delivery |
|---|---|---|
| Map pin | highest | Allowed |
| Full address geocode | high | Allowed |
| Area/locality geocode | medium | Allowed, with a warning |
| Pincode/city centroid | low | Discovery only; `place_order` blocks city-level |
| IP approximation | unusable | Shop is not listed on MCP |

- Shop coordinates are used server-side for ranking and are never returned to customers.
- Customer addresses are stored only when the customer saves one.
- Only the selected shop receives the delivery address and phone at order time.
- Addresses are owned by the customer through RLS and can be deleted.
- Geocoding defaults to Nominatim. Set `GOOGLE_MAPS_API_KEY` to switch to Google; the provider seam is in `mcp/geo.js`.
- `save_address` returns `match_type` (`house`/`street`/`area`/`city`); `quote_order` refuses `city`.

## 7. Security and privacy

- OAuth 2.1 with PKCE and dynamic client registration. No password or token is a tool argument.
- Bearer tokens are verified against Supabase `/auth/v1/user` and cached for 60 seconds.
- The service role is server-only. Customer rows are read with the user-scoped client and RLS.
- `mcp_place_order` is `SECURITY DEFINER`, revoked from `anon`/`authenticated`, granted only to `service_role`, and locks the quote row.
- One quote produces one order. Retries return the same order.
- Rate limits: 20 quotes/hour, 5 orders/hour, 3 active orders per shop.
- Order total is capped at ₹10,000.
- Logs contain a hashed user id, tool name, status, and duration; not tokens, phones, emails, or addresses.
- `MCP_ENABLED=false` pauses all tools without touching existing orders.
- Customers can cancel only before the shop accepts.

## 8. Local development

```bash
npm install
npm run mcp:dev        # http://localhost:8787
npm run mcp:test       # pure tests, PGlite schema test, HTTP and tool-flow tests
npm run build:mcp-app  # rebuild the checkout card after UI changes
```

`mcp:dev` requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY` in `.env`. `MCP_PUBLIC_URL` defaults to `http://localhost:8787/mcp`.

A local session can be tested with a real Supabase access token from the app, or with `npx mcp-remote http://localhost:8787/mcp --allow-http`.

## 9. Dashboard behavior

MCP orders go straight to Supabase. The dashboard now:

- polls the WhatsApp backend and Supabase every 2.5 seconds;
- merges by order id, keeping the WhatsApp row first;
- chimes and shows the new-order popup for an MCP order;
- writes status changes for `MCP-` orders to Supabase before changing local state;
- still writes WhatsApp-era status changes through the bot.

Without the Supabase poll, MCP orders would only appear after a reload.

## 10. Known limits

- Cash on delivery only. Per-shop UPI settings do not exist yet.
- No push notification to the customer; `get_order` is pull-based.
- No map-pin picker page. A host that exposes coordinates can pass them to `save_address`; otherwise the address text is geocoded.
- In text-only hosts, the model is instructed to ask for confirmation, but there is no cryptographic user gesture behind `confirmed: true`. Hosts with MCP elicitation can add a stronger gate later.
- No OpenAPI/REST facade. The model must be used through an MCP-capable client or `mcp-remote`.
- No opening-hours model; merchants pause AI orders manually.
- MCP Apps support varies by host. The text flow is the universal fallback.
- Nominatim is rate-limited and weak on Indian house numbers; Google Geocoding is recommended for production.
- `supabase/schema.sql` is still the destructive bootstrap; use the dated migration, not the bootstrap, on a live project.
