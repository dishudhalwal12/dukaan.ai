import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';
import { isProhibitedProduct, toPublicProduct } from '../mcp/catalog.js';
import { searchNearbyProducts } from '../mcp/data.js';

/**
 * The plugin guidelines OpenAI publishes before submission, as tests.
 *
 * Two of them fail silently at runtime and are caught by automated review:
 * incomplete tool annotations, and prohibited goods reaching a result. This file
 * is the pre-submission gate for both, so a regression shows up here instead of
 * in a "held tools" email after upload.
 */
console.log('--- RUNNING PLUGIN GUIDELINE CHECKS (OpenAI submission) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const userId = '11111111-1111-4111-8111-111111111111';
const config = {
  supabaseUrl: 'http://localhost:54321', serviceKey: 'service', anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:54321/auth/v1',
  googleKey: '', geocoderProvider: 'nominatim', enabled: true, allowInsecure: true,
  documentationUrl: '', expectedResource: '', allowedOrigins: [],
};
const repo = {
  userId,
  loadEnabledShops: async () => [],
  findShopsNearby: async () => [],
  searchNearbyProducts: async () => [],
  getShop: async () => null,
  getShopByUserId: async () => null,
  getCatalog: async () => [],
  getProfile: async () => null,
  saveProfile: async () => ({}),
  saveLocation: async () => ({}),
  listAddresses: async () => [],
  getAddressRow: async () => null,
  saveAddress: async () => ({}),
  deleteAddress: async () => ({}),
  createQuote: async () => ({}),
  findRecentQuote: async () => null,
  getQuote: async () => null,
  usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
  placeOrder: async () => null,
  getOrder: async () => null,
  listOrders: async () => [],
  cancelOrder: async () => ({}),
};

const server = createServerFactory(config, { repo })({
  authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
});
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'guidelines', version: '1.0.0' }, { capabilities: {} });
await Promise.all([client.connect(ct), server.connect(st)]);
const { tools } = await client.listTools();
await client.close();
await server.close();

// ── Annotation completeness, every tool ────────────────────────────────────
assert.ok(tools.length >= 15, `expected the full tool set, got ${tools.length}`);
for (const tool of tools) {
  const a = tool.annotations || {};
  for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
    assert.strictEqual(typeof a[key], 'boolean', `${tool.name}.${key} must be an explicit boolean`);
  }
  assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a real description`);
}
ok(`all ${tools.length} tools carry explicit readOnly, destructive, and openWorld hints`);

// ── Annotations match behaviour ────────────────────────────────────────────
const hint = (name) => tools.find((tool) => tool.name === name).annotations;
for (const name of ['find_shops', 'find_products_nearby', 'search_products', 'get_shop']) {
  assert.strictEqual(hint(name).readOnlyHint, true, `${name} only reads`);
  assert.strictEqual(hint(name).openWorldHint, true, `${name} reaches public shops`);
}
for (const name of ['list_addresses', 'get_customer_profile', 'get_order', 'list_orders', 'show_checkout']) {
  assert.strictEqual(hint(name).readOnlyHint, true, `${name} only reads`);
  assert.strictEqual(hint(name).openWorldHint, false, `${name} is scoped to one account`);
}
for (const name of ['place_order', 'cancel_order', 'delete_address', 'save_address']) {
  assert.strictEqual(hint(name).readOnlyHint, false, `${name} changes state`);
  assert.strictEqual(hint(name).destructiveHint, true, `${name} is irreversible or overwrites`);
}
assert.strictEqual(hint('place_order').destructiveHint, true, 'placing an order is an irreversible transaction');
assert.strictEqual(hint('cancel_order').destructiveHint, true, 'cancelling cannot be undone');
ok('each annotation matches what the tool actually does');

// ── Prohibited goods never reach a result ──────────────────────────────────
for (const name of ['Cigarettes (20 pack)', 'Gutkha masala', 'Beer 650ml', 'Vape pen', 'Nicotine pouch', 'Tramadol 50mg']) {
  assert.strictEqual(isProhibitedProduct(name), true, `${name} must be blocked`);
  assert.strictEqual(toPublicProduct({ external_id: 'x', name, price: '₹10', stock: 5 }), null, `${name} must not become a product`);
}
for (const name of ['Amul Gold Milk (1L)', 'Dettol Original Soap (125g)', 'Aashirvaad Atta 5kg']) {
  assert.strictEqual(isProhibitedProduct(name), false, `${name} is ordinary groceries`);
  assert.ok(toPublicProduct({ external_id: 'x', name, price: '₹40', stock: 5 }), `${name} must survive`);
}
ok('tobacco, alcohol, nicotine, and prescription rows are blocked; groceries are not');

// ── The nearby query applies the same rule ────────────────────────────────
const stub = {
  rpc: async () => ({
    data: [
      { shop_id: 's1', user_id: 'u1', name: 'Shop', latitude: 1, longitude: 1, distance_km: '0.1', product_id: 'p1', product_name: 'Cigarettes', price: '₹20', unit: 'pack', stock: 5 },
      { shop_id: 's1', user_id: 'u1', name: 'Shop', latitude: 1, longitude: 1, distance_km: '0.1', product_id: 'p2', product_name: 'Amul Gold Milk (1L)', price: '₹68', unit: 'carton', stock: 5 },
    ],
    error: null,
  }),
};
const rows = await searchNearbyProducts(stub, { lat: 1, lng: 1, tokens: ['milk'] });
assert.strictEqual(rows.length, 1, 'the blocked row is dropped in the data layer too');
assert.strictEqual(rows[0].productName, 'Amul Gold Milk (1L)');
ok('the nearby path drops prohibited rows before they reach the assistant');

console.log(`\nAll ${n} plugin guideline checks passed.`);
