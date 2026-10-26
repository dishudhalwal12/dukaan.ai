# MCP address truth + write resilience — implementation plan

**Branch:** `feat/mcp-address-truth` (worktree `.worktrees/mcp-address-truth`, cut from `origin/main` = `e1ae110`)
**Spec:** the user's decision of 2026-10-26 (chat): no paid geocoding; the location captured at MCP
sign-in is the delivery coordinate; the typed address is stored verbatim and read by the shop; the
POS order popup's field set is the contract; the chat asks exactly name, phone, address.
**Scope:** Phase A + Phase B of the agreed 10-phase plan. Phase C (10k-shop SQL search) and Phase D
(catalog hygiene) are intentionally out of scope here.

## Global constraints

- No new runtime dependencies (Vercel bundle stays lean; `undici` is not a direct dependency).
- No geocoding on the happy path. A geocoder is consulted only when no coordinate exists.
- Never claim more address precision than the evidence supports (`geocode_verified` is the only
  source of `house`).
- Every tool failure keeps a stable `code` in `structuredContent` so the assistant can act on it.
- `npm run mcp:test` and `npm test` must stay green after every task.
- Comments explain WHY (this codebase's convention); no comment restates the line below it.

## Pre-flight: interfaces shared between tasks

| Producer → consumer | Contract |
|---|---|
| Task 1 → 2,5 | `customer_addresses.precision_source`, `.geocode_verified`, `.coords_captured_at`; `publicAddress()` exposes both. |
| Task 2 → 3 | `save_address` returns `precision_source` + `geocode_verified`; `resolveLocation` reads the same field names from the row. |
| Task 2 → 4 | `quote_order` reads `row.geocode_verified` for `address_verified`. |
| Task 6 → 2,4 | Instruction text names the three chat questions and the retry-once rule the tools implement. |
| Task 7 → 8,9 | `createResilientFetch` is the only network wrapper; quote idempotency assumes a retried POST may arrive twice. |
| Task 8 → 5 | A reused quote must still carry the POS field set. |

## Task 1: Address-source columns

**Goal:** the database can record how a coordinate was obtained, so "house" is never inferred.

**Files:** `supabase/migrations/2026-10-29_address_source.sql`, `scripts/test_mcp_schema.mjs`

**Steps**

1. RED: extend `scripts/test_mcp_schema.mjs` to apply the new migration and assert the three columns
   exist, that `precision_source` rejects an unknown value, and that existing rows are backfilled
   (`source='geocoded'` → `geocode_verified = true`, otherwise false).
   Run: `node scripts/test_mcp_schema.mjs`
   Expected: FAIL — `ENOENT` reading `2026-10-29_address_source.sql`.
2. GREEN: write the migration (additive, `NOT VALID` then `VALIDATE`, backfill in one statement).
   Run: `node scripts/test_mcp_schema.mjs`
   Expected: PASS — `All 12 MCP schema checks passed.`
3. Commit: `feat(mcp): record how a delivery coordinate was obtained`.

**Acceptance:** migration is idempotent (`IF NOT EXISTS`), PGlite applies it after the two MCP
migrations, and the backfill leaves no row with `geocode_verified = true` unless it was geocoded.

## Task 2: save_address never depends on the geocoder

**Goal:** a typed address plus an app location always saves; text is stored verbatim; precision is
derived from evidence, never asserted by the caller.

**Files:** `mcp/tools.js`, `mcp/data.js`, `scripts/test_mcp_address_source.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_address_source.js` covers five cases against the real tool with a fake
   repo: (a) explicit lat/lng saves with `precision_source="chat_shared"`, `geocode_verified=false`;
   (b) no coordinates but a fresh app location saves with `precision_source="app_location"`, and the
   geocoder is **not** called; (c) text is echoed verbatim (no `Sambhar` → `Sambhar Lake`);
   (d) a caller claiming `source:"geocoded", match_type:"house"` without a geocode is downgraded to
   `street`/`map_pin`; (e) with no coordinates and a failing geocoder the error is
   `location_required` (never `address_not_found`).
   Run: `node scripts/test_mcp_address_source.js`
   Expected: FAIL — `save_address` returns `address_not_found`.
2. GREEN: implement the coordinate ladder + computed precision in `save_address`; persist
   `precision_source`/`geocode_verified`/`coords_captured_at` through `saveAddressRow`; expose them
   from `publicAddress`.
   Run: `node scripts/test_mcp_address_source.js` → PASS (5/5)
3. Wire into `npm run mcp:test`; run `npm run mcp:test`
   Expected: PASS, all suites.
4. Commit: `feat(mcp): save a typed address from the app location, not the geocoder`.

**Acceptance:** no code path in `save_address` can return `address_not_found`; a geocode is attempted
only when both coordinate sources are absent.

## Task 3: a raw pin is not a rooftop

**Goal:** `find_shops` stops labelling caller-supplied coordinates as house-level.

**Files:** `mcp/tools.js`, `scripts/test_mcp_find_location.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_find_location.js` asserts `find_shops({latitude,longitude})` returns
   `location.match_type === "street"`, `needs_exact_address === true`, and
   `location.precision_source === "chat_shared"`; and that an `address_id` row with
   `geocode_verified=true, match_type="house"` keeps `house`.
   Run: `node scripts/test_mcp_find_location.js` → FAIL (match_type is `house`, no `precision_source`).
2. GREEN: implement in `resolveLocation`.
   Run: `node scripts/test_mcp_find_location.js` → PASS (2/2)
3. Commit: `fix(mcp): stop calling a shared pin a house-level address`.

**Acceptance:** the only branch that can produce `house` is one backed by a geocoded row.

## Task 4: the quote confirms with the POS field set

**Goal:** the confirmation the assistant reads back contains exactly what the shopkeeper's popup
shows, and a quote cannot be built without coordinates.

**Files:** `mcp/tools.js`, `scripts/test_mcp_quote_confirmation.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_quote_confirmation.js` asserts the `quote_order` result carries
   `address_verified`, `maps_url`, and a `confirmation` string containing name, phone, address,
   item line, total, and "cash on delivery"; and that an address row without finite coordinates
   fails with `location_required`.
   Run: `node scripts/test_mcp_quote_confirmation.js` → FAIL (fields absent).
2. GREEN: build the confirmation from the profile + address row + priced items.
   Run: `node scripts/test_mcp_quote_confirmation.js` → PASS (3/3)
3. Commit: `feat(mcp): quote returns the exact fields the POS popup shows`.

**Acceptance:** the confirmation string is rendered from data, never by the model.

## Task 5: the placed order round-trips into the POS shape

**Goal:** prove at the database and mapper level that an MCP order fills every customer field the
POS `Order` type reads.

**Files:** `scripts/test_mcp_schema.mjs`, `scripts/test_mcp_pos_contract.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_pos_contract.js` maps a placed order row through `publicOrder()` and
   asserts `customer.name`, `customer.whatsappNumber`, `customer.address`, `customer.latitude`,
   `customer.longitude`, `customer.mapsUrl`, plus `items[].{productId,name,quantity,price}`,
   `total`, `paymentMethod`, `channel`; `test_mcp_schema.mjs` additionally asserts the stored
   `orders.customer` JSONB contains all six customer keys.
   Run both → FAIL (`mapsUrl` missing from the order JSONB assertion is expected to surface a real
   gap; if it passes, the assertion is already covered and the task is a no-op — record a ruling).
2. GREEN: fix whatever the assertions expose (expected: `customer.location.mapsUrl` present but the
   flat `customer.mapsUrl` absent — add it to the RPC without breaking the POS reader).
   Run both → PASS.
3. Commit.

**Acceptance:** the assertion list mirrors `src/types.ts` `Customer`/`OrderItem` exactly.

## Task 6: the chat asks the three questions

**Goal:** the assistant is told, in its own instructions and in the tool descriptions, to collect
name, phone, and address only — and to retry a failed write once.

**Files:** `mcp/server.js`, `mcp/tools.js`, `scripts/test_mcp_instructions.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_instructions.js` asserts `SERVER_INSTRUCTIONS` contains: the three field
   names in one block, "do not ask for a landmark or pincode" when a house line is present, the
   retry-once rule, and that `save_address`'s description no longer promises geocoding first.
   Run → FAIL.
2. GREEN: rewrite the two instruction blocks.
   Run → PASS (4/4)
3. Commit: `docs(mcp): ask for name, phone, address — nothing else`.

**Acceptance:** no instruction tells the model to chase a landmark or to re-authenticate.

## Task 7: one retry on a dead socket

**Goal:** a stale keep-alive socket after an idle gap costs a retry, not a customer-visible failure.

**Files:** `mcp/net.js`, `mcp/supabase.js`, `scripts/test_mcp_net.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_net.js` asserts: a `fetch` that throws `ECONNRESET` once then succeeds
   returns the response and called the delegate twice; three consecutive socket errors surface the
   last error after exactly `retries + 1` attempts; an HTTP 400 is returned without a retry; a
   non-socket exception (`TypeError`) is not retried; `createSupabaseFetch()` is the default used by
   both clients.
   Run → FAIL (`mcp/net.js` missing).
2. GREEN: implement, wire `global.fetch` in both clients.
   Run → PASS (5/5)
3. Commit: `fix(mcp): retry a write once when the pooled socket is dead`.

**Acceptance:** retries are bounded, logged with `retryCount`, and never applied to HTTP errors.

## Task 8: quote_order is idempotent

**Goal:** the retry from Task 7 must not create two quotes.

**Files:** `supabase/migrations/2026-10-30_quote_request_hash.sql`, `mcp/data.js`, `mcp/repo.js`,
`mcp/tools.js`, `scripts/test_mcp_quote_idempotency.js`, `scripts/test_mcp_schema.mjs`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_quote_idempotency.js` calls `quote_order` twice with the same basket and
   asserts one `createQuote`, one `quote_id`, `reused: true` on the second call; a changed quantity
   produces a new quote; a consumed quote is not reused. `test_mcp_schema.mjs` asserts the
   `request_hash` column and its index.
   Run → FAIL.
2. GREEN: migration + `findRecentQuote` + hash plumbing.
   Run → PASS; `npm run mcp:test` PASS.
3. Commit: `fix(mcp): make quote_order safe to retry`.

**Acceptance:** the hash covers shop, address, and the normalised item list; the window is 60 s.

## Task 9: a broken stream answers instead of resetting

**Goal:** when a response stream fails mid-flight, the client gets a JSON error, not `ECONNRESET`.

**Files:** `mcp/nodeAdapter.js`, `scripts/test_mcp_node_adapter.js`, `package.json`

**Steps**

1. RED: `scripts/test_mcp_node_adapter.js` feeds `sendWebResponse` a response whose body errors
   before any byte is written and asserts a 500 JSON body with `error.code === "stream_error"` and
   that `res.destroy` was not called; a second case errors after headers are sent and asserts
   `destroy` **was** called.
   Run → FAIL (`destroy` is called in both).
2. GREEN: branch on `res.headersSent`.
   Run → PASS (2/2)
3. Commit: `fix(mcp): turn a broken response stream into a JSON error`.

**Acceptance:** no path destroys the socket while headers are still unsent.

## Task 10: log the new failure classes

**Goal:** operations can see retries and address provenance without reading customer data.

**Files:** `mcp/logging.js`, `scripts/test_mcp_logging.js`

**Steps**

1. RED: extend `scripts/test_mcp_logging.js` with: `retryCount`, `shopCount`, `precision` appear
   when supplied; `net_error` is accepted as a code; email/phone/address never appear in the line.
   Run → FAIL.
2. GREEN: extend `toolLogLine` (whitelist of numeric fields, no free text).
   Run → PASS.
3. Commit: `feat(mcp): log retries and address provenance`.

**Acceptance:** the log line stays JSON, PII-free, and one line per request.

## Review focus

The plan's tests exercise happy paths and explicit inputs; the reviewer should additionally consider:
concurrent identical quotes arriving in the same second (Task 8), a geocode that succeeds while the
app location is stale (Task 2), `sendWebResponse` when the body is already partially flushed
(Task 9), and whether any Task 2 downgrade can silently drop a customer's typed line.
