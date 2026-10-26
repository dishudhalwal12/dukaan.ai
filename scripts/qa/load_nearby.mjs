import assert from 'assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * Load QA: does the nearby search still answer correctly when there are as many
 * shops as the plan promised to support?
 *
 *   10 000 shops, 200 000 products, 200 labelled queries.
 *
 * What it proves:
 *   - no truncation: a shop created last is still found (the old path could only
 *     ever see what PostgREST's 1 000-row cap returned);
 *   - correctness: the shop the SQL returns is the same shop a brute-force oracle
 *     in JS picks, for a point taken from that shop's own neighbourhood;
 *   - latency: p50/p95 for the two functions, measured here.
 *
 * PGlite is Postgres compiled to WASM in one process: its timings are an upper
 * bound for a real Postgres instance, not a prediction of it. The numbers printed
 * below are what this machine measured; they are not extrapolated.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const SHOPS = 10_000;
const PRODUCTS_PER_SHOP = 20;
const QUERIES = 200;

const migrations = [
  'supabase/migrations/2026-10-26_mcp.sql',
  'supabase/migrations/2026-10-27_mcp_default_on.sql',
  'supabase/migrations/2026-10-28_mcp_customer_location.sql',
  'supabase/migrations/2026-10-29_address_source.sql',
  'supabase/migrations/2026-10-30_quote_request_hash.sql',
  'supabase/migrations/2026-10-31_order_customer_mapsurl.sql',
  'supabase/migrations/2026-11-01_mcp_nearby_search.sql',
];

console.log(`--- MCP LOAD QA: ${SHOPS} shops, ${SHOPS * PRODUCTS_PER_SHOP} products, ${QUERIES} queries ---`);

const db = new PGlite();
await db.exec(read('scripts/fixtures/mcp_schema_bootstrap.sql'));
for (const file of migrations) await db.exec(read(file));

let started = Date.now();
await db.exec(`INSERT INTO auth.users (id) SELECT md5('user' || g)::uuid FROM generate_series(1, ${SHOPS}) g`);
await db.exec(`
  INSERT INTO public.business_profiles
    (user_id, store_name, store_lat, store_lng, store_location_source, mcp_enabled, delivery_radius_km, orders_paused)
  SELECT
    md5('user' || g)::uuid,
    'Shop ' || g,
    20 + random() * 10,
    70 + random() * 10,
    'gps', true, 5, false
  FROM generate_series(1, ${SHOPS}) g
`);
await db.exec(`
  INSERT INTO public.products (user_id, external_id, name, price, stock, stock_unit)
  SELECT
    md5('user' || g)::uuid,
    'p' || g || '_' || k,
    -- One shop in seven stocks soap; the rest carry filler items, so a match has
    -- to be found by the query and not by "every shop has everything".
    CASE
      WHEN g % 7 = 0 AND k <= 3 THEN 'Lifeboy Soap'
      ELSE (ARRAY['Amul Gold Milk','Tata Salt','Parle-G Biscuits','Maggi Noodles','Surf Excel','Colgate Paste','Aashirvaad Atta','Tata Tea'])[1 + ((g + k) % 8)] || ' #' || g
    END,
    '₹' || (10 + ((g + k) % 90)),
    5, 'units'
  FROM generate_series(1, ${SHOPS}) g, generate_series(1, ${PRODUCTS_PER_SHOP}) k
`);
const seedMs = Date.now() - started;

// The seeded index lives in the store name ("Shop 412"); row_number() over a
// hashed uuid would not preserve it, and the soap flag has to match the seed
// exactly or the oracle grades the wrong shop.
const shops = (await db.query('SELECT store_name, public_shop_id, store_lat, store_lng FROM public.business_profiles')).rows
  .map((row) => {
    const index = Number(String(row.store_name).replace(/\D+/g, ''));
    return {
      g: index,
      publicShopId: row.public_shop_id,
      lat: Number(row.store_lat),
      lng: Number(row.store_lng),
      hasSoap: index % 7 === 0,
    };
  });

const soapShops = shops.filter((shop) => shop.hasSoap);
assert.ok(soapShops.length > 500, 'the fixture stocked soap in enough shops');

const distanceKm = (aLat, aLng, bLat, bLng) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Brute-force oracle: what the answer should be, ignoring the database. */
function oracle(lat, lng) {
  let best = null;
  for (const shop of soapShops) {
    const km = distanceKm(lat, lng, shop.lat, shop.lng);
    if (km <= 5 && (!best || km < best.km)) best = { shop, km };
  }
  return best;
}

const timings = [];
let correct = 0;
let oracleMisses = 0;

for (let i = 0; i < QUERIES; i += 1) {
  const anchor = soapShops[Math.floor((i / QUERIES) * soapShops.length)];
  // Jitter inside the shop's own neighbourhood so the expected answer is that shop
  // (or a closer soap shop, which the oracle decides).
  const lat = anchor.lat + (Math.random() - 0.5) * 0.004;
  const lng = anchor.lng + (Math.random() - 0.5) * 0.004;

  const expected = oracle(lat, lng);
  if (!expected) {
    oracleMisses += 1;
    continue;
  }

  const t0 = performance.now();
  const result = await db.query(
    'SELECT shop_id FROM public.mcp_search_nearby_products($1, $2, 5, ARRAY[\'soap\'], 5)',
    [lat, lng]
  );
  timings.push(performance.now() - t0);

  if (result.rows[0]?.shop_id === expected.shop.publicShopId) correct += 1;
}

const answered = QUERIES - oracleMisses;
const correctRate = answered === 0 ? 0 : (correct / answered) * 100;
timings.sort((a, b) => a - b);
const percentile = (p) => timings[Math.min(timings.length - 1, Math.floor((p / 100) * timings.length))] || 0;

// Latency for the shop list too, since the assistant calls it first.
const findTimings = [];
for (let i = 0; i < 50; i += 1) {
  const anchor = soapShops[Math.floor((i / 50) * soapShops.length)];
  const t0 = performance.now();
  await db.query('SELECT shop_id FROM public.mcp_find_shops($1, $2, 10, NULL, 5)', [anchor.lat, anchor.lng]);
  findTimings.push(performance.now() - t0);
}
findTimings.sort((a, b) => a - b);
const findP95 = findTimings[Math.min(findTimings.length - 1, Math.floor(0.95 * findTimings.length))] || 0;

// The shop created last must still be reachable: the old code stopped at the
// REST row cap and could never see it.
const lastSoapShop = soapShops[soapShops.length - 1];
assert.ok(lastSoapShop.g > 9000, 'the fixture actually contains a late shop');
const late = await db.query(
  'SELECT shop_id FROM public.mcp_search_nearby_products($1, $2, 5, ARRAY[\'soap\'], 5)',
  [lastSoapShop.lat, lastSoapShop.lng]
);
assert.strictEqual(late.rows[0]?.shop_id, lastSoapShop.publicShopId, 'a shop beyond row 9 000 is found');
await db.close();

console.log(`
  shops              ${SHOPS}
  products           ${SHOPS * PRODUCTS_PER_SHOP}
  seed time          ${seedMs} ms
  queries answered   ${answered} (${oracleMisses} had no soap shop within 5 km)
  correct shop       ${correctRate.toFixed(1)} %  (oracle: nearest shop that stocks soap)
  search p50 / p95   ${percentile(50).toFixed(1)} ms / ${percentile(95).toFixed(1)} ms
  find_shops p95     ${findP95.toFixed(1)} ms
  late-shop lookup   found shop #${lastSoapShop.g}
`);

assert.ok(correctRate >= 95, `correct shop rate ${correctRate.toFixed(1)}% must be at least 95%`);
assert.ok(percentile(95) < 1500, `p95 ${percentile(95).toFixed(1)}ms must stay under 1500ms`);
assert.ok(findP95 < 1500, `find_shops p95 ${findP95.toFixed(1)}ms must stay under 1500ms`);

console.log('  RESULT: LOAD OK\n');
