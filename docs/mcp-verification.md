# MCP implementation verification

Branch: `feat/mcp-ai-ordering`

Run these commands to reproduce every automated check:

```bash
npm run mcp:test
npm test
npx tsc --noEmit
npm run build
npm run build:mcp-app
```

Last run on 2026-10-26:

| Command | Result | Scope |
|---|---|---|
| `npm run mcp:test` | 29 files passed | pure rules, saved location, consent UI, auth, geo, schema, HTTP, tools, MCP App |
| `npm test` | passed | existing app regression suite |
| `npx tsc --noEmit` | passed | TypeScript |
| `npm run build` | passed | Vite static bundle + secret guard |
| `npm run build:mcp-app` | passed | 243 KB single-file checkout card |

> `npm run build` fails on a machine whose `.env` sets `VITE_LLM_BASE_URL` to a
> `127.0.0.1:8080` local model: the secret guard rejects the loopback backend
> baked into the bundle. Run it with that variable empty, as Vercel does.

## Phase-by-phase evidence

### Phase 0 — OAuth setup and consent

- `src/screens/OAuthConsentScreen.tsx` implements the Supabase `authorization_id` flow, login, details, approve, and deny.
- The sign-in half mirrors the POS sheet in `src/components/AuthModal.tsx`: white "Continue with Google" with the Google mark, the privacy consent line (opening an in-page privacy sheet), and the "OR EMAIL" divider.
- After sign-in the page runs the onboarding location sheet (`src/components/LocationModal.tsx`, `audience="customer"`) once, and keeps the fix on the customer's own `customer_profiles` row. `Update` / `Remove` sit in the approval card.
- `scripts/test_mcp_consent_ui.js` pins all of the above, including the rule that this page never writes the merchant app's `dukan-oauth-in-progress` marker.
- `src/index.tsx` mounts `/oauth/consent` without mounting the merchant app.
- `scripts/mcp/check_oauth_config.mjs` checks Supabase AS discovery and the MCP protected-resource document.
- **External gate:** the live Supabase project returns 404 for OAuth discovery. The OAuth 2.1 server and dynamic client registration must be enabled in the dashboard.

### Phase 1 — Schema and ownership

- `supabase/migrations/2026-10-26_mcp.sql`, `2026-10-27_mcp_default_on.sql`, and `2026-10-28_mcp_customer_location.sql`.
- `scripts/test_mcp_schema.mjs` runs the migration on PGlite and proves:
  - columns and defaults exist;
  - the placement RPC inserts from the quote snapshot;
  - the same quote twice returns one order;
  - an expired quote is rejected;
  - one customer cannot place another customer's quote;
  - RLS shows an order only to the customer who placed it;
  - the location columns exist, a half position and an unknown source are refused by the database, and the position is readable/writable only by its owner.
- **External gate:** the migration is not applied to the live Supabase project (`mcp_enabled` column missing). No database password is available in the repository environment.

### Phase 1b — the position captured at sign-in

- `scripts/test_mcp_customer_data.js` pins the writer: only location keys are upserted (so an existing name and phone survive), a half or impossible position is refused before it reaches the row, and the profile is read with `select(*)` so an unmigrated project still works.
- `mcp/location.js` holds the freshness rule (30 days), the precision model, and the wording used in tool replies. `scripts/test_mcp_location.js` covers day 29 vs day 31, a half position, a missing timestamp, and IP-level precision.
- `scripts/test_mcp_tools.js` proves `find_shops` with no location uses the saved fix (`source: "app_location"`, `needs_exact_address: true`), an explicit pincode still wins, a 45-day-old fix is refused with `location_stale`, and `remember_location` stores a coordinate shared in chat.
- `get_customer_profile` now reports the last known location and its age.

### Phase 1c — the anon key the server actually uses

- A production deploy failed every customer-owned tool with
  `profile_unavailable: Invalid API key` while discovery still worked: the
  runtime `SUPABASE_ANON_KEY` had been rotated away from.
- `mcp/keys.js` now probes `/auth/v1/settings` with each candidate key before any
  tool runs, keeps the first one the project accepts, and caches the verdict per
  instance. A refused key returns `503 server_misconfigured` naming
  `SUPABASE_ANON_KEY`; a probe outage is treated as `unknown` and never fails the
  deployment closed.
- `scripts/test_mcp_supabase_key.js` proves the fallback ladder, the caching, the
  `invalid` vs `unknown` split, the `/health` field, the 503, and that
  `fromError` turns "Invalid API key" into an operator error.

### Phase 3 — scale (10 000 shops) and catalog hygiene

- `supabase/migrations/2026-11-01_mcp_nearby_search.sql` moves the distance work into two
  `SECURITY DEFINER` functions (`mcp_find_shops`, `mcp_search_nearby_products`) with a bounding-box
  prefilter, the delivery-radius rule, and the row limit inside Postgres. No extension dependency.
- `find_products_nearby` answers "which shop near me has soap" in one call, replacing find_shops plus
  one search per shop. Rows with an unparseable price (₹0, "FREE") are dropped in the data layer, so
  an unsellable item can never reach the card and then fail inside quote_order.
- `mcp_find_shops` takes `p_ignore_radius` for the "nearest shop is X km away" probe; without it the
  radius filter also applied to the probe, so the out-of-range message was unreachable.
- Alias expansion is shelf words only (`sabun`, `sope`), never brand fragments: the nearby query ORs
  every token, so "dettol" would have matched Dettol handwash and "paste" tomato paste. `scripts/test_mcp_nearby_products.js` covers grouping, ordering, aliases, and
  the empty case.
- `mcp/catalog.js` folds units into one vocabulary, reads a pack count from "2 pack", drops
  placeholder images, tolerates one or two edits ("lifebuoy" → "Lifeboy", "soop" → "soap"), and ranks
  equally good matches by stock. Per-shop search still shows a sold-out row so the assistant can say so.
- `npm run qa:load` seeds 10 000 shops / 200 000 products in PGlite and checks the SQL answer against
  a brute-force oracle: **100 % correct shop, p50 0.7 ms / p95 0.9 ms, a shop beyond row 9 000 found**.
  PGlite runs in-process WASM, so these numbers exclude network round-trips and connection pooling: they are a floor for the query itself, not a production latency measurement. Re-measure against the real project before promising a p95 to anyone.
- `npm run qa:personas` runs P1–P10 (transcript replay, no-location, Hinglish, dense area, out of
  range, merchant edges, adversary, flaky socket, stale fix, non-technical): **10 pass, 0 fail**.

### Phase 2 — MCP server and auth

- `mcp/server.js`, `mcp/auth.js`, `api/mcp.js`, `mcp/dev-server.js`.
- `scripts/test_mcp_config.js` proves a missing `MCP_PUBLIC_URL` fails fast.
- `scripts/test_mcp_http.js` proves:
  - `/health` is public;
  - `/.well-known/oauth-protected-resource` names the correct resource and Supabase issuer;
  - unauthenticated calls get `401` plus a `resource_metadata` challenge;
  - a bad token is refused;
  - a valid token initializes the server;
  - `tools/list` includes the ordering tools;
  - `resources/list` includes `ui://dukaan/checkout.html`;
  - a configured origin allowlist does not fall back to wildcard.
- The local server was started with `npm run mcp:dev`; `/health` and discovery answered `200`, `/mcp` answered `401` with a challenge.
- `scripts/test_mcp_vercel_entry.mjs` exercises `api/mcp.js` through a real Node HTTP server and the rewrite query.

### Phase 3 — Read tools and location

- `find_shops`, `get_shop`, `search_products`, profile and address tools.
- `scripts/test_mcp_geometry.js`: distance, ranking, delivery radius, disabled/paused shops, fail-closed cases.
- `scripts/test_mcp_tools.js` also exercises the pincode and text-address geocoding paths.
- `scripts/test_mcp_catalog.js`: paise prices, product mapping, aliases, search.
- `scripts/test_mcp_geo.js`: Nominatim and Google mapping, cache, empty result, network failure.
- `scripts/test_mcp_validation.js`: phone, pincode, name.

### Phase 4 — Quote and order

- `quote_order`, `place_order`, `show_checkout`, `get_order`, `list_orders`, `cancel_order`.
- `scripts/test_mcp_order_rules.js`: catalog pricing, duplicate merge, unknown/unavailable items, stock quantity, quantity bounds, line cap, expiry, cancel rules.
- `scripts/test_mcp_tools.js`: a real in-memory MCP client calls every tool; unconfirmed placement is refused; retries return the same order; `show_checkout` does not place.
- `scripts/test_mcp_limits.js`: quote/order/active-order limits and the ₹10,000 total cap.
- `scripts/test_mcp_auth.js` and `scripts/test_mcp_auth_config.js`: token verification cache, expiry, discovery.

### Phase 5 — Dashboard integration

- `src/services/cloudSync.ts`:
  - `fetchOrdersFromCloud` now returns `userId`, `customerUserId`, and `channel`;
  - `updateOrderStatusInCloud` updates a Supabase-owned order;
  - `fetchMcpSettingsFromCloud` / `saveMcpSettingsToCloud`.
- `src/App.tsx`:
  - the 2.5 s poll now merges the WhatsApp backend and Supabase;
  - `MCP-` orders write status to Supabase before local state;
  - WhatsApp notifications are skipped for MCP orders.
- `src/screens/OnlineStoreScreen.tsx`: enable/disable, 1–10 km radius, pause.
- `src/types.ts`: `customerUserId`, `channel`.

### Phase 6 — Install page and docs

- `src/screens/ConnectScreen.tsx` at `/connect`.
- `docs/mcp.md` covers Supabase, Vercel, merchant enablement, client snippets, location, security, and limits.
- README links to it.

### Phase 7 — Hardening

- Global kill switch: `MCP_ENABLED`.
- Limits: 20 quotes/hour, 5 orders/hour, 3 active orders per shop, ₹10,000 cap.
- Fail-closed when limit counts cannot be read.
- PII-safe logs: hashed user id, tool/method, status, duration; no tokens, phones, emails, or addresses.
- `MCP_ALLOWED_ORIGINS` for browser clients.
- Quote/order ownership checks and RLS.

### Phase 8 — MCP App checkout card

- `mcp-app/` is a vanilla Vite app built to one HTML file.
- `scripts/build-mcp-app.mjs` embeds it into `mcp/apps/checkoutHtml.generated.js`.
- `mcp/apps/checkout.js` serves it as `text/html;profile=mcp-app` with a CSP and `prefersBorder: false`.
- `show_checkout` is registered with `_meta.ui.resourceUri`; it returns text fallback for hosts without MCP Apps.
- The UI calls `place_order` only from the explicit "Place order" button.

## Not verified here

- A real OAuth login against the live Supabase project.
- A deployed Vercel function.
- A real order in the live database.
- Rendering in ChatGPT/Claude/Cursor/OpenCode.
- The basic-host MCP Apps harness (the card builds and the resource is listed, but no host render was run).

Those require the external project access and client accounts listed in `docs/mcp.md`.
