import assert from 'assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bootstrap = readFileSync(resolve(root, 'scripts/fixtures/mcp_schema_bootstrap.sql'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/2026-10-26_mcp.sql'), 'utf8');
const defaultOn = readFileSync(resolve(root, 'supabase/migrations/2026-10-27_mcp_default_on.sql'), 'utf8');
const customerLocation = readFileSync(resolve(root, 'supabase/migrations/2026-10-28_mcp_customer_location.sql'), 'utf8');
const addressSource = readFileSync(resolve(root, 'supabase/migrations/2026-10-29_address_source.sql'), 'utf8');
const orderCustomerMapsUrl = readFileSync(resolve(root, 'supabase/migrations/2026-10-31_order_customer_mapsurl.sql'), 'utf8');
const quoteRequestHash = readFileSync(resolve(root, 'supabase/migrations/2026-10-30_quote_request_hash.sql'), 'utf8');
const nearbySearch = readFileSync(resolve(root, 'supabase/migrations/2026-11-01_mcp_nearby_search.sql'), 'utf8');

console.log('--- RUNNING MCP SCHEMA / RPC TESTS (PGlite) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const db = new PGlite();
await db.exec(bootstrap);
await db.exec(migration);
await db.exec(defaultOn);
await db.exec(customerLocation);

const u1 = '11111111-1111-4111-8111-111111111111';
const u2 = '22222222-2222-4222-8222-222222222222';
const s1 = '33333333-3333-4333-8333-333333333333';
const s2 = '44444444-4444-4444-8444-444444444444';
await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2), ($3), ($4)', [u1, u2, s1, s2]);

// Two rows written BEFORE 2026-10-29 exists, so the backfill has something to fix.
await db.query(
  "INSERT INTO public.customer_addresses (user_id, line1, lat, lng, source, match_type) VALUES ($1, 'geocoded before the migration', 26.9, 75.8, 'geocoded', 'house'), ($1, 'typed before the migration', 26.9, 75.8, 'manual', 'area')",
  [u1]
);
await db.exec(addressSource);
await db.exec(orderCustomerMapsUrl);
await db.exec(quoteRequestHash);
await db.exec(nearbySearch);
ok('all seven migrations apply to a Supabase-shaped Postgres database');
await db.query(
  "INSERT INTO public.business_profiles (user_id, store_name, store_lat, store_lng, mcp_enabled) VALUES ($1, 'Shop One', 26.9124, 75.7873, true), ($2, 'Shop Two', 26.92, 75.79, true)",
  [s1, s2]
);
assert.ok(Number((await db.query('SELECT count(*)::int AS c FROM public.business_profiles WHERE public_shop_id IS NOT NULL')).rows[0].c) === 2);
const radius = await db.query("SELECT delivery_radius_km, mcp_enabled, orders_paused FROM public.business_profiles WHERE user_id = $1", [s1]);
assert.strictEqual(Number(radius.rows[0].delivery_radius_km), 5);
assert.strictEqual(radius.rows[0].mcp_enabled, true);
assert.strictEqual(radius.rows[0].orders_paused, false);
const defaultOnShop = await db.query("INSERT INTO public.business_profiles (user_id, store_name, store_lat, store_lng) VALUES ($1, 'Default On Shop', 26.9, 75.8) RETURNING mcp_enabled", [u2]);
assert.strictEqual(defaultOnShop.rows[0].mcp_enabled, true, 'new shops are AI-enabled by default');
ok('shop defaults, public ids, and AI-on-by-default are applied');

const address = {
  label: 'Home',
  name: 'Asha',
  phone: '+919999999999',
  address: '12, MG Road, Jaipur 302001',
  lat: 26.9124,
  lng: 75.7873,
  mapsUrl: 'https://maps.google.com/?q=26.9124,75.7873',
};
const items = [
  { productId: 'milk', name: 'Amul Taaza Milk', pricePaise: 2700, price: '₹27', unit: '500ml', quantity: 2, totalPaise: 5400, total: '₹54' },
  { productId: 'bread', name: 'Brown Bread', pricePaise: 4500, price: '₹45', unit: '400g', quantity: 1, totalPaise: 4500, total: '₹45' },
];
const quote = await db.query(
  "INSERT INTO public.order_quotes (user_id, shop_user_id, address_snapshot, items, total, payment_method, notes, expires_at) VALUES ($1, $2, $3::jsonb, $4::jsonb, 99, 'COD', 'MCP order', now() + interval '10 minutes') RETURNING id",
  [u1, s1, JSON.stringify(address), JSON.stringify(items)]
);
const quoteId = quote.rows[0].id;

const placed = await db.query('SELECT * FROM public.mcp_place_order($1, $2, $3)', [quoteId, u1, 'MCP-20261026-abc123']);
assert.strictEqual(placed.rows.length, 1);
const order = placed.rows[0];
assert.strictEqual(order.user_id, s1);
assert.strictEqual(order.customer_user_id, u1);
assert.strictEqual(order.channel, 'mcp');
assert.strictEqual(order.status, 'NEW');
assert.strictEqual(order.external_id, 'MCP-20261026-abc123');
assert.strictEqual(Number(order.total), 99);
assert.strictEqual(order.customer.name, 'Asha');
assert.strictEqual(order.customer.address, '12, MG Road, Jaipur 302001');
assert.strictEqual(Number(order.customer.latitude), 26.9124);
assert.strictEqual(order.delivery_address, '12, MG Road, Jaipur 302001');
for (const key of ['name', 'whatsappNumber', 'address', 'mapsUrl', 'latitude', 'longitude']) {
  assert.ok(Object.hasOwn(order.customer, key), `orders.customer.${key} is what the POS popup reads`);
}
ok('the order row carries every customer field the POS popup reads');

const again = await db.query('SELECT * FROM public.mcp_place_order($1, $2, $3)', [quoteId, u1, 'MCP-20261026-abc123']);
assert.strictEqual(String(again.rows[0].id), String(order.id));
const count = await db.query('SELECT count(*)::int AS c FROM public.orders');
assert.strictEqual(Number(count.rows[0].c), 1);
ok('placing the same quote twice returns the same order');

const expired = await db.query(
  "INSERT INTO public.order_quotes (user_id, shop_user_id, address_snapshot, items, total, expires_at) VALUES ($1, $2, $3::jsonb, $4::jsonb, 99, now() - interval '1 minute') RETURNING id",
  [u1, s1, JSON.stringify(address), JSON.stringify(items)]
);
let expiredCode = '';
try {
  await db.query('SELECT * FROM public.mcp_place_order($1, $2, $3)', [expired.rows[0].id, u1, 'MCP-expired']);
} catch (error) {
  expiredCode = String(error.message || error);
}
assert.match(expiredCode, /quote_expired/);
ok('an expired quote cannot be placed');

const foreign = await db.query(
  "INSERT INTO public.order_quotes (user_id, shop_user_id, address_snapshot, items, total, expires_at) VALUES ($1, $2, $3::jsonb, $4::jsonb, 99, now() + interval '10 minutes') RETURNING id",
  [u2, s1, JSON.stringify(address), JSON.stringify(items)]
);
let foreignCode = '';
try {
  await db.query('SELECT * FROM public.mcp_place_order($1, $2, $3)', [foreign.rows[0].id, u1, 'MCP-foreign']);
} catch (error) {
  foreignCode = String(error.message || error);
}
assert.match(foreignCode, /quote_not_owned/);
ok('one customer cannot place another customer\'s quote');

// Customer read policy: only the order they placed is visible.
await db.exec('GRANT SELECT ON public.orders TO authenticated; GRANT USAGE ON SCHEMA public TO authenticated;');
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${u1}';`);
const own = await db.query('SELECT external_id FROM public.orders');
assert.strictEqual(own.rows.length, 1);
assert.strictEqual(own.rows[0].external_id, 'MCP-20261026-abc123');
await db.exec(`SET request.jwt.claim.sub = '${u2}';`);
const other = await db.query('SELECT external_id FROM public.orders');
assert.strictEqual(other.rows.length, 0);
await db.exec('RESET ROLE; RESET request.jwt.claim.sub;');
ok('RLS shows an order only to the customer who placed it');

// ── the position captured during MCP sign-in ────────────────────────────────
const locationColumns = await db.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_profiles' AND column_name LIKE 'location_%'"
);
const columnNames = locationColumns.rows.map((row) => row.column_name).sort();
assert.deepStrictEqual(
  columnNames,
  ['location_accuracy_m', 'location_captured_at', 'location_label', 'location_lat', 'location_lng', 'location_source'],
  'every location column from 2026-10-28 exists'
);
ok('the customer location columns exist');

// Half a position, an unknown source, and an out-of-range latitude are refused
// by the database itself, not only by the server.
let halfPosition = '';
try {
  await db.query('INSERT INTO public.customer_profiles (user_id, location_lat) VALUES ($1, 26.9)', [u1]);
} catch (error) {
  halfPosition = String(error.message || error);
}
assert.match(halfPosition, /customer_profiles_location_coords_check/);

await db.query(
  "INSERT INTO public.customer_profiles (user_id, location_lat, location_lng, location_source) VALUES ($1, 26.9124, 75.7873, 'gps') ON CONFLICT (user_id) DO UPDATE SET location_lat = 26.9124",
  [u1]
);

let badSource = '';
try {
  await db.query(
    "UPDATE public.customer_profiles SET location_source = 'telepathy' WHERE user_id = $1",
    [u1]
  );
} catch (error) {
  badSource = String(error.message || error);
}
assert.match(badSource, /customer_profiles_location_source_check/);
ok('the database refuses half a position and an unknown source');

await db.exec(`
  GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO authenticated;
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '${u1}';
`);
const ownerUpdate = await db.query(
  'UPDATE public.customer_profiles SET location_accuracy_m = 18, location_captured_at = now() WHERE user_id = $1',
  [u1]
);
assert.strictEqual(Number(ownerUpdate.affectedRows ?? 1), 1, 'the owner can update their own row');
const ownProfile = await db.query('SELECT location_lat FROM public.customer_profiles');
assert.strictEqual(ownProfile.rows.length, 1, 'the owner reads the row they just wrote');
assert.strictEqual(Number(ownProfile.rows[0].location_lat), 26.9124);

await db.exec(`SET request.jwt.claim.sub = '${u2}';`);
const foreignProfile = await db.query('SELECT location_lat FROM public.customer_profiles');
assert.strictEqual(foreignProfile.rows.length, 0, 'another customer never sees this position');
const hijack = await db.query('UPDATE public.customer_profiles SET location_lat = 1 WHERE user_id = $1', [u1]);
assert.strictEqual(Number(hijack.affectedRows ?? 0), 0, 'a foreign update touches no rows');
await db.exec('RESET ROLE;');
await db.exec('RESET request.jwt.claim.sub;');
const untouched = await db.query('SELECT location_lat FROM public.customer_profiles WHERE user_id = $1', [u1]);
assert.strictEqual(Number(untouched.rows[0].location_lat), 26.9124);
ok('RLS lets the owner write their position and hides it from everyone else');

// ── the address-source columns (2026-10-29) ─────────────────────────────────
const addressColumns = await db.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_addresses' AND column_name IN ('precision_source','geocode_verified','coords_captured_at')"
);
assert.deepStrictEqual(
  addressColumns.rows.map((row) => row.column_name).sort(),
  ['coords_captured_at', 'geocode_verified', 'precision_source']
);

const backfill = await db.query(
  "SELECT line1, precision_source, geocode_verified FROM public.customer_addresses WHERE user_id = $1 ORDER BY line1",
  [u1]
);
const geocodedRow = backfill.rows.find((row) => row.line1.startsWith('geocoded'));
const typedRow = backfill.rows.find((row) => row.line1.startsWith('typed'));
assert.strictEqual(geocodedRow.geocode_verified, true, 'a geocoded row is marked verified');
assert.strictEqual(geocodedRow.precision_source, 'geocoded');
assert.strictEqual(typedRow.geocode_verified, false, 'a typed row is never marked verified');
assert.strictEqual(typedRow.precision_source, 'typed');
ok('existing addresses are backfilled: geocoded = verified, everything else is not');

let badPrecision = '';
try {
  await db.query("UPDATE public.customer_addresses SET precision_source = 'telepathy' WHERE user_id = $1", [u1]);
} catch (error) {
  badPrecision = String(error.message || error);
}
assert.match(badPrecision, /customer_addresses_precision_source_check/);
ok('precision_source only accepts the four known provenance values');

// ── retry-safe quotes (2026-10-30) ─────────────────────────────────────────
const hashColumn = await db.query(
  "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_quotes' AND column_name = 'request_hash'"
);
assert.strictEqual(hashColumn.rows.length, 1, 'order_quotes.request_hash exists');
assert.strictEqual(hashColumn.rows[0].is_nullable, 'YES', 'old quotes keep working without a hash');
const hashIndex = await db.query(
  "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'order_quotes_request_hash_idx'"
);
assert.strictEqual(hashIndex.rows.length, 1, 'the lookup index exists');
assert.match(hashIndex.rows[0].indexdef, /CREATE UNIQUE INDEX/i, 'uniqueness is what makes the retry safe, not just speed');
assert.match(hashIndex.rows[0].indexdef, /consumed_at IS NULL/i, 'a consumed quote must not block a fresh one');
ok('quotes carry a request hash with the index the retry lookup needs');

// ── nearby search in SQL (2026-11-01) ──────────────────────────────────────
// Six shops at known distances: two serviceable, one paused, one with an
// IP-approximate position, one with no catalog, and one far outside the radius.
const s3 = '55555555-5555-4555-8555-555555555555';
const s4 = '66666666-6666-4666-8666-666666666666';
const s5 = '77777777-7777-4777-8777-777777777777';
await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2), ($3)', [s3, s4, s5]);
await db.query(
  `INSERT INTO public.business_profiles (user_id, store_name, store_lat, store_lng, store_location_source, mcp_enabled, delivery_radius_km, orders_paused) VALUES
     ($1, 'Paused Shop',   26.9124, 75.7873, 'gps',            true, 5, true),
     ($2, 'IP Shop',       26.9124, 75.7873, 'ip_approximate', true, 5, false),
     ($3, 'Far Shop',      27.5000, 76.5000, 'gps',            true, 5, false)`,
  [s3, s4, s5]
);
await db.query(
  `INSERT INTO public.products (user_id, external_id, name, price, stock, stock_unit) VALUES
     ($1, 'kirana_1', 'Dettol Original Soap (125g)', '₹55', 90, 'bars'),
     ($1, 'kirana_2', 'Amul Gold Milk (1L)',          '₹68', 30, 'cartons'),
     ($2, 'kirana_3', 'Lifeboy Soap',                 '₹40',  3, 'units'),
     ($3, 'kirana_4', 'Paused Soap',                  '₹20', 10, 'bars'),
     ($4, 'kirana_5', 'IP Soap',                      '₹20', 10, 'bars'),
     ($5, 'kirana_6', 'Far Soap',                     '₹20', 10, 'bars')`,
  [s1, s2, s3, s4, s5]
);

const shopIdOf = async (uid) => (await db.query('SELECT public_shop_id FROM public.business_profiles WHERE user_id = $1', [uid])).rows[0].public_shop_id;
const sid1 = await shopIdOf(s1);
const sid2 = await shopIdOf(s2);
const sid3 = await shopIdOf(s3);

const nearby = await db.query('SELECT * FROM public.mcp_find_shops(26.9124, 75.7873, 5, NULL, 10)');
const nearbyIds = nearby.rows.map((row) => row.shop_id);
assert.deepStrictEqual(nearbyIds, [sid1, sid2], 'only shops inside their own radius, nearest first');
assert.ok(!nearby.rows.some((row) => row.name === 'Paused Shop'), 'a paused shop is not discoverable');
assert.ok(!nearby.rows.some((row) => row.name === 'IP Shop'), 'an IP-approximate shop is not discoverable');
assert.ok(!nearby.rows.some((row) => row.name === 'Far Shop'), 'a shop beyond the radius is not returned');
assert.strictEqual(Number(nearby.rows[0].item_count), 2);
ok('mcp_find_shops filters by radius, pauses, and approximate positions');

const byName = await db.query("SELECT shop_id FROM public.mcp_find_shops(26.9124, 75.7873, 5, 'Two', 10)");
assert.strictEqual(byName.rows.length, 1);
assert.strictEqual(byName.rows[0].shop_id, sid2);
ok('mcp_find_shops filters by shop name without touching products');

const soap = await db.query("SELECT shop_id, product_name, price FROM public.mcp_search_nearby_products(26.9124, 75.7873, 5, ARRAY['soap'], 10)");
assert.strictEqual(soap.rows.length, 2, 'only the two in-radius soap rows');
assert.strictEqual(soap.rows[0].shop_id, sid1, 'nearest shop first');
assert.ok(soap.rows.every((row) => /soap/i.test(row.product_name)));
assert.ok(!soap.rows.some((row) => /milk/i.test(row.product_name)), 'non-matching products stay out');
ok('mcp_search_nearby_products returns only stocked matches, nearest first');

await db.query("INSERT INTO public.products (user_id, external_id, name, price, stock, stock_unit) VALUES ($1, 'kirana_7', 'Lux Soap', '₹30', 4, 'bars')", [s3]);
const afterPausedProduct = await db.query("SELECT shop_id FROM public.mcp_search_nearby_products(26.9124, 75.7873, 5, ARRAY['soap'], 10)");
assert.ok(!afterPausedProduct.rows.some((row) => row.shop_id === sid3), 'a paused shop cannot appear even with stock');
await db.query("UPDATE public.products SET stock = 0 WHERE external_id = 'kirana_3'");
const afterSoldOut = await db.query("SELECT product_name FROM public.mcp_search_nearby_products(26.9124, 75.7873, 5, ARRAY['soap'], 10)");
assert.ok(!afterSoldOut.rows.some((row) => row.product_name === 'Lifeboy Soap'), 'a sold-out item is not offered');
const limited = await db.query("SELECT shop_id FROM public.mcp_search_nearby_products(26.9124, 75.7873, 5, ARRAY['soap'], 1)");
assert.strictEqual(limited.rows.length, 1, 'the limit is applied inside SQL');
ok('stock, pause state, and the row limit are enforced by the query itself');

console.log(`\nAll ${n} MCP schema checks passed.`);
await db.close();
