# Nukkad MCP ordering

One public MCP endpoint lets any MCP-capable AI client order from nearby Nukkad shops. WhatsApp stays as a channel; it is no longer the only one.

> The examples below use the deployed origin, `https://dukaan-ai-hypnexis.vercel.app/mcp`. Use that same URL in Vercel, Supabase Site URL, and the AI client. The resource identifier in the discovery document must match the URL a client types, `/mcp` included.

```
ChatGPT / Claude / Claude Code / OpenCode / Cursor / VS Code
                    │  MCP over HTTPS + OAuth 2.1
                    ▼
          https://dukaan-ai-hypnexis.vercel.app/mcp
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
| 1b. Customer location captured at sign-in | Done and tested | `supabase/migrations/2026-10-28_mcp_customer_location.sql`, `mcp/location.js`, `src/services/customerLocation.ts` |
| 2. MCP server, auth gate, discovery | Done and tested | `mcp/`, `api/mcp.js` |
| 3. Read tools and geocoding | Done and tested | `mcp/tools.js`, `mcp/geo.js` |
| 4. Quote/order tools | Done and tested | `mcp/tools.js`, `mcp/orderRules.js` |
| 5. Dashboard integration | Done | `src/App.tsx`, `src/services/cloudSync.ts`, `src/screens/OnlineStoreScreen.tsx` |
| 6. Install page and docs | Done | `src/screens/ConnectScreen.tsx`, this file |
| 7. Hardening | Done (limits, kill switch, PII-safe logs) | `mcp/limits.js`, `mcp/logging.js` |
| 8. MCP App checkout card | Done; host support varies | `mcp-app/`, `mcp/apps/` |

External steps that need the Supabase and Vercel project owners are listed below. They cannot be performed from this repository alone.

### Live project state observed on 2026-10-26

- `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` now returns **200** with `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `registration_endpoint`; the OAuth 2.1 server is enabled.
- `https://dukaan-ai-hypnexis.vercel.app/.well-known/oauth-protected-resource` returns the RFC 9728 document, and `/mcp` answers **401** with a `resource_metadata` challenge.
- `GET /rest/v1/business_profiles?select=mcp_enabled,delivery_radius_km,orders_paused,public_shop_id` returns **200** and `customer_addresses` / `order_quotes` answer, so `2026-10-26_mcp.sql` and `2026-10-27_mcp_default_on.sql` ARE applied to the live project.
- `GET /rest/v1/customer_profiles?select=location_lat` returns **400 `42703` "column customer_profiles.location_lat does not exist"**, so `2026-10-28_mcp_customer_location.sql` is the one migration still pending. Until it runs the consent page keeps the fix on the device and says so.
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
9. Run `supabase/migrations/2026-10-27_mcp_default_on.sql` so every existing shop becomes AI-enabled by default.
10. Run `supabase/migrations/2026-10-28_mcp_customer_location.sql` so the position captured on the consent page can be saved. Until it runs, the page says so and keeps the value on the device only; approval is never blocked.

AI ordering is on by default. The shop still needs `store_lat`/`store_lng` captured with `gps` or `manual` (not `ip_approximate`), and at least one priced product in stock. Use **Pause AI orders** for a temporary stop; there is no per-shop enable toggle.

Verify discovery:

```bash
MCP_PUBLIC_URL=https://dukaan-ai-hypnexis.vercel.app/mcp \
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
MCP_PUBLIC_URL=https://dukaan-ai-hypnexis.vercel.app/mcp
MCP_AUTH_ISSUER=https://<project-ref>.supabase.co/auth/v1
MCP_ENABLED=true
# optional, for better geocoding
GOOGLE_MAPS_API_KEY=
MCP_GEOCODER_PROVIDER=google
```

`VITE_MCP_URL` is build-time and is already pinned in `vercel.json`.

A custom domain is optional. If you add one, set `MCP_PUBLIC_URL` to it before deploying: the resource identifier in the discovery document must match the URL clients type, `/mcp` included.

`vercel.json` rewrites:

- `/mcp` → `/api/mcp?__route=/mcp`
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` → `/api/mcp`
- `/oauth/consent` and `/connect` → the SPA

The function performs no OAuth issuance. Supabase is the authorization server; the function only verifies bearer tokens and serves the RFC 9728 discovery document.

## 3. Shop availability

AI ordering is **on by default** for every registered shop. The shopkeeper does not need to find an enable switch.

1. Sign in to Nukkad as the shopkeeper.
2. Open **Settings → Online Store & AI Orders**.
3. Set the delivery radius (1–10 km).
4. Use **Pause AI orders** when the shop is closed.

Only shops with a real `store_lat`/`store_lng`, at least one priced product in stock, and `orders_paused = false` are discoverable. Shops whose location source is `ip_approximate` are excluded. `mcp_enabled` is retained as the database default and server filter, not a merchant-facing toggle.

## 4. Connect a client

The public endpoint is `https://dukaan-ai-hypnexis.vercel.app/mcp`.

| Client | How |
|---|---|
| ChatGPT | Settings → Connectors → Advanced → Developer mode → Create → paste URL → OAuth |
| Claude | Settings → Connectors → Add custom connector → paste URL → OAuth |
| Claude Code | `claude mcp add --transport http nukkad https://dukaan-ai-hypnexis.vercel.app/mcp` |
| Cursor | `~/.cursor/mcp.json` with `{ "mcpServers": { "dukaan": { "url": "..." } } }` |
| VS Code | `.vscode/mcp.json` with `{ "servers": { "dukaan": { "type": "http", "url": "..." } } }` |
| OpenCode | `opencode mcp add nukkad --global --url https://dukaan-ai-hypnexis.vercel.app/mcp`, then `/mcps` → sign in |
| stdio-only clients | `npx mcp-remote https://dukaan-ai-hypnexis.vercel.app/mcp` |

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

### The position captured at sign-in

The consent page runs the same location sheet the shopkeeper sees at onboarding, with customer copy. If the customer allows it, the fix is written to their own `customer_profiles` row (`location_lat`, `location_lng`, `location_accuracy_m`, `location_source`, `location_captured_at`) with their own token under the existing RLS policies. It is asked for once, and can be updated or removed on the consent page at any time.

- `find_shops` with no location argument uses that fix and marks the answer `source: "app_location"`, with its age.
- A fix older than **30 days** is refused (`location_stale`) and the assistant is told to ask for a pincode or area.
- An explicit `address_id`, pincode, area, or coordinates always win over the saved fix.
- `remember_location`, and `save_address` when coordinates are passed, refresh it with `source: "chat_shared"`, so a location shared in one chat is not asked for again.
- A position is never a delivery address: `quote_order` still requires a `customer_addresses` row.

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
- Bearer tokens are verified against Supabase `/auth/v1/user`, checked against the configured issuer, and cached for 60 seconds.
- Optional audience binding: set `MCP_EXPECTED_RESOURCE` and add a Supabase custom access-token hook that puts that URL in `aud` for OAuth clients. Without the hook, leave it unset.
- The service role is server-only. Profile and address rows use the user-scoped client and RLS; order/quote reads use the service role with explicit `customer_user_id`/`user_id` filters, and the customer SELECT policy remains a second layer.
- `mcp_place_order` is `SECURITY DEFINER`, revoked from `anon`/`authenticated`, granted only to `service_role`, and locks the quote row.
- One quote produces one order. Retries return the same order.
- Rate limits: 20 quotes/hour, 5 orders/hour, 3 active orders per shop.
- Order total is capped at ₹10,000.
- Logs contain a hashed user id, tool name, status, and duration; not tokens, phones, emails, or addresses.
- `MCP_ENABLED=false` pauses new quotes/orders and address/profile writes. Discovery, existing-order status, and cancellation remain available. Existing orders are never touched.
- Customers can cancel only before the shop accepts.
- Stock is checked against the shelf count at quote and placement, but it is not reserved. Two customers can race for the last unit; the shop can reject the second order.

## 8. Local development

```bash
npm install
npm run mcp:dev        # http://localhost:8787
npm run mcp:test       # pure tests, PGlite schema test, HTTP and tool-flow tests
npm run build:mcp-app  # rebuild the checkout card after UI changes
```

`mcp:dev` requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY` in `.env`. `MCP_PUBLIC_URL` defaults to `http://localhost:8787/mcp`.

A local session can be tested with a real Supabase access token from the app, or with `npx mcp-remote http://localhost:8787/mcp --allow-http`.

### When every customer-owned tool fails with "Invalid API key"

Symptom: `find_shops` (when it reads the saved app location), `get_customer_profile`,
`save_address`, and `quote_order` all return `profile_unavailable: Invalid API key`,
while `/health`, discovery, and shop-only reads still work.

Cause: the server's **anon** key is refused by the project. The service key is
fine, which is why reads that bypass RLS keep working. This usually means the
Vercel runtime variable `SUPABASE_ANON_KEY` is an older copy than the project's
current anon/publishable key, or points at a different project. A rotated legacy
key still decodes as `ref: <project>, role: anon`, which is why boot-time claim
checks cannot catch it.

The server now handles this itself (`mcp/keys.js`):

- before any tool runs, it asks the project which candidate key it accepts
  (`GET /auth/v1/settings`), and uses the first one that answers 200;
- candidates are `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `/health` reports `supabaseKey: "ok" | "invalid" | "unknown" | "skipped"`;
- when nothing is accepted, MCP calls get `503 server_misconfigured` naming the
  variable, and tool-level failures are translated to `anon_key_invalid` — never
  to advice about re-authenticating the client.

Fix, if `/health` says `"invalid"`:

1. Copy the value of `VITE_SUPABASE_ANON_KEY` (the build key that demonstrably
   works) into `SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables.
2. Redeploy so the function picks it up.
3. `curl -s https://<site>/health` and confirm `"supabaseKey":"ok"`.

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
- No stock reservation; the shelf count is a soft check, not an atomic hold.
- No map-pin picker page. A host that exposes coordinates can pass them to `save_address`; otherwise the address text is geocoded.
- In text-only hosts, the model is instructed to ask for confirmation, but there is no cryptographic user gesture behind `confirmed: true`. Hosts with MCP elicitation can add a stronger gate later.
- No OpenAPI/REST facade. The model must be used through an MCP-capable client or `mcp-remote`.
- No opening-hours model; merchants pause AI orders manually.
- MCP Apps support varies by host. The text flow is the universal fallback.
- Nominatim is rate-limited and weak on Indian house numbers; Google Geocoding is recommended for production.
- `supabase/schema.sql` is still the destructive bootstrap; use the dated migration, not the bootstrap, on a live project.
