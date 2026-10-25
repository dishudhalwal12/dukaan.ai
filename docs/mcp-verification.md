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

Last run on 2026-10-25:

| Command | Result | Scope |
|---|---|---|
| `npm run mcp:test` | 15 files passed | pure rules, auth, geo, schema, HTTP, tools, MCP App |
| `npm test` | passed | existing app regression suite |
| `npx tsc --noEmit` | passed | TypeScript |
| `npm run build` | passed | Vite static bundle + secret guard |
| `npm run build:mcp-app` | passed | 243 KB single-file checkout card |

## Phase-by-phase evidence

### Phase 0 — OAuth setup and consent

- `src/screens/OAuthConsentScreen.tsx` implements the Supabase `authorization_id` flow, login, details, approve, and deny.
- `src/index.tsx` mounts `/oauth/consent` without mounting the merchant app.
- `scripts/mcp/check_oauth_config.mjs` checks Supabase AS discovery and the MCP protected-resource document.
- **External gate:** the live Supabase project returns 404 for OAuth discovery. The OAuth 2.1 server and dynamic client registration must be enabled in the dashboard.

### Phase 1 — Schema and ownership

- `supabase/migrations/2026-10-26_mcp.sql`.
- `scripts/test_mcp_schema.mjs` runs the migration on PGlite and proves:
  - columns and defaults exist;
  - the placement RPC inserts from the quote snapshot;
  - the same quote twice returns one order;
  - an expired quote is rejected;
  - one customer cannot place another customer's quote;
  - RLS shows an order only to the customer who placed it.
- **External gate:** the migration is not applied to the live Supabase project (`mcp_enabled` column missing). No database password is available in the repository environment.

### Phase 2 — MCP server and auth

- `mcp/server.js`, `mcp/auth.js`, `api/mcp.js`, `mcp/dev-server.js`.
- `scripts/test_mcp_http.js` proves:
  - `/health` is public;
  - `/.well-known/oauth-protected-resource` names the correct resource and Supabase issuer;
  - unauthenticated calls get `401` plus a `resource_metadata` challenge;
  - a bad token is refused;
  - a valid token initializes the server;
  - `tools/list` includes the ordering tools;
  - `resources/list` includes `ui://dukaan/checkout.html`.
- The local server was started with `npm run mcp:dev`; `/health` and discovery answered `200`, `/mcp` answered `401` with a challenge.
- `scripts/test_mcp_vercel_entry.mjs` exercises `api/mcp.js` through a real Node HTTP server and the rewrite query.

### Phase 3 — Read tools and location

- `find_shops`, `get_shop`, `search_products`, profile and address tools.
- `scripts/test_mcp_geometry.js`: distance, ranking, delivery radius, disabled/paused shops, fail-closed cases.
- `scripts/test_mcp_catalog.js`: paise prices, product mapping, aliases, search.
- `scripts/test_mcp_geo.js`: Nominatim and Google mapping, cache, empty result, network failure.
- `scripts/test_mcp_validation.js`: phone, pincode, name.

### Phase 4 — Quote and order

- `quote_order`, `place_order`, `show_checkout`, `get_order`, `list_orders`, `cancel_order`.
- `scripts/test_mcp_order_rules.js`: catalog pricing, duplicate merge, unknown/unavailable items, quantity bounds, line cap, expiry, cancel rules.
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
