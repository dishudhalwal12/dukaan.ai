# MCP scale + catalog hygiene + QA — implementation plan (Phase C + D)

**Branch:** continues `feat/mcp-address-truth` in `.worktrees/mcp-address-truth` (base `5a04ba1`).
**Spec:** user decision 2026-10-26 (no paid APIs; app location is the delivery point; POS popup field
set is the contract) plus the accept/reject numbers agreed on 2026-10-26: at 10k shops the current
code finds the right shop 10–20% of the time; this phase must reach ≥80%, with ≥95% correct-shop on a
labelled fixture.
**Out of scope:** paid geocoding, WhatsApp, merchant catalog UI.

## Global constraints

- No new runtime dependencies (no pg_trgm requirement either: token matching stays `ILIKE` so the
  migration cannot fail on a project where the extension is absent; fuzzy matching lives in JS where
  the catalog is small).
- Production must never load every shop into memory. SQL does the distance work, `LIMIT` server-side.
- Existing tool response shapes stay compatible; new fields are additive.
- `npm run mcp:test`, `npm test`, `tsc`, `build` green after every task.

## Pre-flight

| Producer → consumer | Contract |
|---|---|
| C1 → C2 | RPC names/columns: `mcp_find_shops`, `mcp_search_nearby_products` |
| C2 → C3, C4 | `repo.findShopsNearby`, `repo.searchNearbyProducts` |
| D1 → D2, D3 | `normaliseUnit`, `parsePackSize`, `isPlaceholderImage` in `mcp/catalog.js` |
| C4 → Q1 | `find_products_nearby` name + arguments used by the persona harness |

## Task 1: Nearby search in SQL (C1)

**Files:** `supabase/migrations/2026-11-01_mcp_nearby_search.sql`, `scripts/test_mcp_schema.mjs`

**Steps**
1. RED: apply the migration in the schema test and assert `mcp_find_shops` returns only shops inside
   their own delivery radius, nearest first, excluding paused / AI-off / ip_approximate shops, and
   that `mcp_search_nearby_products` returns only products in stock whose name matches every token.
   Run: `node scripts/test_mcp_schema.mjs` → FAIL (missing file).
2. GREEN: write the migration (bbox prefilter + haversine, `LIMIT` inside SQL, indexes).
   Run → PASS.
3. Commit.

## Task 2: Data layer for the two RPCs (C2)

**Files:** `mcp/data.js`, `mcp/repo.js`, `scripts/test_mcp_nearby_data.js`, `package.json`

**Steps**
1. RED: stub client asserts both callers pass the right RPC name/arguments and normalise rows
   (numeric strings → numbers, `item_count` → `catalogItemCount`).
   Run → FAIL.
2. GREEN: implement `findShopsNearby` / `searchNearbyProducts`; expose on the repo.
   Run → PASS.
3. Commit.

## Task 3: find_shops uses SQL instead of loading every shop (C3)

**Files:** `mcp/tools.js`, `scripts/test_mcp_find_shops_scale.js`, `package.json`

**Steps**
1. RED: with a repo that only offers `findShopsNearby` (no `loadEnabledShops`), `find_shops` returns
   the SQL rows unchanged; an empty result asks for a wider radius once and reports the nearest
   distance; the response still carries `location` + `shops` in the old shape.
   Run → FAIL.
2. GREEN: branch on `typeof repo.findShopsNearby === 'function'` (production), keeping the in-memory
   ranking only as a test seam for the older fakes.
   Run → PASS.
3. Commit.

## Task 4: find_products_nearby — "which shop near me has this" (C4)

**Files:** `mcp/tools.js`, `mcp/server.js`, `scripts/test_mcp_nearby_products.js`, `package.json`

**Steps**
1. RED: the tool returns shops that stock the query, nearest first, with priced items and a one-line
   summary per shop; an unknown product returns `no_matching_shops`; tokens include the Hindi alias
   (`sabun` for `soap`); instructions tell the assistant to prefer it over N per-shop searches.
   Run → FAIL.
2. GREEN: implement + register + update `SERVER_INSTRUCTIONS`.
   Run → PASS.
3. Commit.

## Task 5: catalog hygiene — units, packs, placeholder images (D1)

**Files:** `mcp/catalog.js`, `scripts/test_mcp_catalog_hygiene.js`, `package.json`

**Steps**
1. RED: `normaliseUnit('units')` → `unit`; `parsePackSize('2 pack')` → 2; `isPlaceholderImage` catches
   `via.placeholder.com`; `toPublicProduct` drops a placeholder `imageUrl` and reports the normalised
   unit.
   Run → FAIL.
2. GREEN: implement.
   Run → PASS.
3. Commit.

## Task 6: alias + typo tolerance in per-shop search (D2)

**Files:** `mcp/catalog.js`, `scripts/test_mcp_catalog_fuzzy.js`, `package.json`

**Steps**
1. RED: `searchCatalog(catalog, 'sabun')` finds a soap; `searchCatalog(catalog, 'lifebuoy')` finds the
   merchant's `Lifeboy` entry; a one-letter typo (`soop`) still finds soap; an unrelated query returns
   nothing (no false positives).
   Run → FAIL.
2. GREEN: add alias entries + a bounded edit-distance fallback.
   Run → PASS.
3. Commit.

## Task 7: ranking prefers reliable stock (D3)

**Files:** `mcp/catalog.js`, `scripts/test_mcp_catalog_hygiene.js`

**Steps**
1. RED: two matching products, one with `stock: 2` and one with `stock: 40` — the better-stocked one
   ranks first when the match score ties; `stock: 0` never appears in results.
   Run → FAIL.
2. GREEN: implement tie-break in `searchCatalog`.
   Run → PASS.
3. Commit.

## Task 8: persona QA harness (Q1)

**Files:** `scripts/qa/personas.mjs`, `package.json`

**Steps**
1. RED: the harness boots the real server with a fixture repo and asserts P1–P10 (the transcript
   replay, no-location, Hinglish, dense area, out of range, merchant edges, adversary, flaky network,
   non-technical, stale fix). One persona per assertion block, printed as a table.
   Run → FAIL (file missing).
2. GREEN: write it; every persona passes against the current implementation.
   Run → PASS, `npm run qa:personas`.
3. Commit.

## Task 9: 10k-shop load harness (Q2)

**Files:** `scripts/qa/load_nearby.mjs`, `package.json`

**Steps**
1. RED: seed PGlite with 10 000 shops and 200 000 products across India, run both RPCs for 200
   labelled queries, assert: no truncation (a shop beyond the 1 000-row REST cap is still found),
   p95 < 1500 ms, and ≥95 % of queries return the nearest shop that actually stocks the item
   (compared against a brute-force oracle in JS).
   Run → FAIL (file missing).
2. GREEN: write it; record the measured numbers in the plan/ledger output.
   Run → PASS, `npm run qa:load`.
3. Commit.

## Task 10: wire the QA commands and re-run every gate

**Files:** `package.json`, `docs/mcp-verification.md`

**Steps**
1. Add `qa:personas`, `qa:load`, and a `qa` script that runs both after `mcp:test`.
2. Run the whole gate set and paste the numbers into the docs.
3. Commit.

## Review focus

Beyond the tests: concurrent quote reuse after the unique index (C1/C3 interplay), a shop that changes
its delivery radius mid-flight, `find_products_nearby` when the query has only stop-words, PGlite
timings versus Postgres (report the difference, do not extrapolate silently), and whether the
fallback seam in Task 3 can hide a production failure.
