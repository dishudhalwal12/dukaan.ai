import assert from 'assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bootstrap = readFileSync(resolve(root, '.superpowers/sdd/mcp-ai-ordering/schema_test_bootstrap.sql'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/2026-10-26_mcp.sql'), 'utf8');

console.log('--- RUNNING MCP SCHEMA / RPC TESTS (PGlite) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const db = new PGlite();
await db.exec(bootstrap);
await db.exec(migration);
ok('the migration applies to a Supabase-shaped Postgres database');

const u1 = '11111111-1111-4111-8111-111111111111';
const u2 = '22222222-2222-4222-8222-222222222222';
const s1 = '33333333-3333-4333-8333-333333333333';
const s2 = '44444444-4444-4444-8444-444444444444';
await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2), ($3), ($4)', [u1, u2, s1, s2]);
await db.query(
  "INSERT INTO public.business_profiles (user_id, store_name, store_lat, store_lng, mcp_enabled) VALUES ($1, 'Shop One', 26.9124, 75.7873, true), ($2, 'Shop Two', 26.92, 75.79, true)",
  [s1, s2]
);
assert.ok(Number((await db.query('SELECT count(*)::int AS c FROM public.business_profiles WHERE public_shop_id IS NOT NULL')).rows[0].c) === 2);
const radius = await db.query("SELECT delivery_radius_km, mcp_enabled, orders_paused FROM public.business_profiles WHERE user_id = $1", [s1]);
assert.strictEqual(Number(radius.rows[0].delivery_radius_km), 5);
assert.strictEqual(radius.rows[0].mcp_enabled, true);
assert.strictEqual(radius.rows[0].orders_paused, false);
ok('shop defaults and public ids are backfilled');

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
ok('the RPC inserts the order from the quote snapshot');

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

console.log(`\nAll ${n} MCP schema checks passed.`);
await db.close();
