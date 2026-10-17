import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';

// Configure a fake Supabase so the provider path is exercised without a network.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {
  registryStatus,
  cloudConfig,
  fetchShopRows,
  loadShopCatalog,
  toBotProduct,
  mapOrderStatus,
  mapPaymentMethod,
  buildOrderRow,
  mirrorOrder,
} = await import('./dukanCloud.js');
const { loadShops, matchNearestShop } = await import('./dukanShops.js');

console.log('--- RUNNING DUKAN CLOUD TESTS (T4) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// A tiny fake fetch: records the call, returns a canned Response-like object.
function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = [] } = handler(url, init) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  impl.calls = calls;
  return impl;
}

// ── config ────────────────────────────────────────────────────────────────────
assert.strictEqual(registryStatus(), 'configured', 'with url + key the registry is configured');
assert.strictEqual(cloudConfig().configured, true);
ok('registryStatus reports configured');

const savedUrl = process.env.SUPABASE_URL;
const savedKey = process.env.SUPABASE_SERVICE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;
assert.strictEqual(registryStatus(), 'unconfigured', 'without credentials the registry is unconfigured');
assert.deepStrictEqual(await fetchShopRows(), [], 'an unconfigured registry yields no shops (dev fallback), never a throw');
ok('an unconfigured registry is not a failure');
process.env.SUPABASE_URL = savedUrl;
process.env.SUPABASE_SERVICE_KEY = savedKey;

// ── shops ─────────────────────────────────────────────────────────────────────
const shopFetch = fakeFetch((url) => {
  if (url.includes('products')) {
    return { body: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }] };
  }
  return {
    body: [
      { user_id: 'u1', store_name: 'Kirana', store_lat: 26.91, store_lng: 75.78 },
      { user_id: 'u2', store_name: 'Corner', store_lat: 26.90, store_lng: 75.79 },
    ],
  };
});
const rows = await fetchShopRows({ fetchImpl: shopFetch });
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].product_count, 2, 'catalog size is tallied per owner for the tie-break');
assert(shopFetch.calls[0].url.includes('business_profiles'), 'the provider reads business_profiles');
assert(shopFetch.calls[0].init.headers.apikey === 'test-service-key', 'the service key is sent');
ok('fetchShopRows reads business_profiles and tallies catalog size');

const wired = await loadShops(async () => fetchShopRows({ fetchImpl: shopFetch }));
assert.strictEqual(wired.length, 2, 'loadShops normalises the provider rows');
assert.strictEqual(wired[0].userId, 'u1');
ok('loadShops consumes the live provider');

// A configured registry that fails must be a hard failure (fail closed).
const brokenFetch = fakeFetch(() => ({ status: 500, body: { message: 'boom' } }));
assert.strictEqual(await loadShops(async () => fetchShopRows({ fetchImpl: brokenFetch })), null, 'a 500 makes the registry unreachable (null), not empty');
ok('a failing registry is unreachable, not empty');

// ── catalog ───────────────────────────────────────────────────────────────────
const catFetch = fakeFetch(() => ({
  body: [
    { id: 7, external_id: 'product_parle_g', name: 'Parle-G Biscuits', price: '10', stock: 5, stock_unit: 'pack', attributes: { category: 'Biscuits' } },
    { id: 8, external_id: 'product_amul_milk', name: 'Amul Taaza Milk', price: '27', stock: 0, stock_unit: '500ml', attributes: {} },
  ],
}));
const catalog = await loadShopCatalog('u1', { fetchImpl: catFetch });
assert.strictEqual(catalog.length, 2);
assert.strictEqual(catalog[0].price, 10, 'the TEXT price becomes a number');
assert.strictEqual(catalog[0].category, 'Biscuits', 'category comes from attributes');
assert.strictEqual(catalog[0].inStock, true);
assert.strictEqual(catalog[1].inStock, false, 'stock 0 is out of stock');
assert(Array.isArray(catalog[0].keywords) && catalog[0].keywords.includes('parle-g'), 'keywords are derived so search works');
assert(catFetch.calls[0].url.includes('user_id=eq.u1'), 'the catalog is scoped to its owner');
ok('loadShopCatalog maps and scopes the owner catalog');

assert.strictEqual(toBotProduct(null), null, 'a null row is not a product');
ok('toBotProduct rejects a null row');

// ── order mirror ──────────────────────────────────────────────────────────────
assert.strictEqual(mapOrderStatus('PENDING'), 'NEW');
assert.strictEqual(mapOrderStatus('ACCEPTED'), 'PREPARING');
assert.strictEqual(mapOrderStatus('OUT_FOR_DELIVERY'), 'READY_FOR_PICKUP');
assert.strictEqual(mapOrderStatus('DELIVERED'), 'COMPLETED');
assert.strictEqual(mapOrderStatus('REJECTED'), 'REJECTED');
assert.strictEqual(mapOrderStatus('CANCELLED'), 'CANCELLED');
assert.strictEqual(mapOrderStatus('nonsense'), 'NEW', 'an unknown status falls back to NEW');
ok('mapOrderStatus covers every engine status');

const order = {
  id: 'DKN-2001',
  userId: 'u1',
  status: 'ACCEPTED',
  totalAmount: 120,
  notes: 'Cash on Delivery',
  customerName: 'Cust',
  customerPhone: '919999999999',
  deliveryAddress: 'Model Town, Jaipur',
  location: { latitude: 26.9124, longitude: 75.7873, mapsUrl: 'https://maps.google.com/?q=1,2' },
  items: [{ name: 'Parle-G Biscuits', price: 10, quantity: 2, total: 20 }],
};
const row = buildOrderRow(order);
assert.strictEqual(row.user_id, 'u1', 'the row is owner-scoped');
assert.strictEqual(row.external_id, 'DKN-2001', 'the engine id is the dedupe key');
assert.strictEqual(row.status, 'PREPARING');
assert.strictEqual(row.payment_method, 'COD');
assert.strictEqual(row.total, 120);
assert.strictEqual(row.customer.name, 'Cust');
assert.strictEqual(row.customer.whatsappNumber, '919999999999');
assert.strictEqual(row.customer.address, 'Model Town, Jaipur');
assert.strictEqual(row.customer.location.latitude, 26.9124, 'the pin reaches the customer JSON');
assert.deepStrictEqual(row.items, order.items);
ok('buildOrderRow maps the order for the shopkeeper app');

assert.strictEqual(mapPaymentMethod({ notes: 'Pay by UPI please' }), 'UPI');
assert.strictEqual(buildOrderRow({ ...order, userId: null }).user_id, null, 'the mapper does not invent an owner');
ok('payment method is COD unless UPI is stated');

// The merchant dashboard reads these flat columns directly; both writers used to
// leave them NULL while the customer JSONB carried the same facts.
assert.strictEqual(row.customer_phone, '919999999999', 'the flat customer phone is written');
assert.strictEqual(row.customer_name, 'Cust', 'the flat customer name is written');
assert.strictEqual(row.delivery_address, 'Model Town, Jaipur', 'the flat delivery address is written');
assert.strictEqual(row.notes, 'Cash on Delivery', 'the order note is written');
const bare = buildOrderRow({ ...order, customerPhone: undefined, customerName: undefined, deliveryAddress: undefined, notes: undefined });
assert.strictEqual(bare.customer_phone, null, 'a missing phone is null, never undefined');
assert.strictEqual(bare.customer_name, 'Customer', 'the flat name falls back the same way the JSONB does');
assert.strictEqual(bare.delivery_address, null, 'a missing address is null');
assert.strictEqual(bare.notes, null, 'a missing note is null');
ok('the flat order columns are written for the merchant dashboard');

const mirrorFetch = fakeFetch(() => ({ status: 201 }));
const mirrored = await mirrorOrder(order, { fetchImpl: mirrorFetch });
assert.strictEqual(mirrored.ok, true);
assert(mirrorFetch.calls[0].url.includes('on_conflict=user_id,external_id'), 'upsert dedupes on (user_id, external_id)');
assert(/merge-duplicates/.test(mirrorFetch.calls[0].init.headers.Prefer), 'the upsert merges rather than duplicates');
ok('mirrorOrder upserts on (user_id, external_id)');

assert.deepStrictEqual(await mirrorOrder(order, { fetchImpl: fakeFetch(() => ({ status: 400, body: { message: 'bad' } })) }), { ok: false, error: 'HTTP 400' });
ok('a rejected mirror reports failure without throwing');

const throwing = async () => { throw new Error('offline'); };
assert.deepStrictEqual(await mirrorOrder(order, { fetchImpl: throwing }), { ok: false, error: 'offline' });
ok('a network failure never throws out of mirrorOrder');

assert.strictEqual((await mirrorOrder({ ...order, userId: null }, { fetchImpl: mirrorFetch })).ok, false, 'an ownerless order is never mirrored');
ok('a misrouted order is never mirrored to Supabase');

console.log('\n========================================');
console.log(`🎉 ALL ${n} DUKAN CLOUD TESTS PASSED 🎉`);
console.log('========================================');
