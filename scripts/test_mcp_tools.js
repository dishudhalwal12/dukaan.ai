import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';
import { DataError } from '../mcp/data.js';

console.log('--- RUNNING MCP TOOL FLOW TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 10, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const shopUserId = '33333333-3333-4333-8333-333333333333';
const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quoteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const shop = {
  shopId: 'shop_one',
  userId: shopUserId,
  name: 'Shop One',
  latitude: 26.9124,
  longitude: 75.7873,
  catalogItemCount: 2,
  deliveryRadiusKm: 5,
  mcpEnabled: true,
  ordersPaused: false,
};
const catalog = [
  { productId: 'milk', name: 'Amul Taaza Milk', pricePaise: 2700, price: '₹27', unit: '500ml', category: 'Dairy', inStock: true },
  { productId: 'bread', name: 'Brown Bread', pricePaise: 4500, price: '₹45', unit: '400g', category: 'Bakery', inStock: true },
];
const address = {
  id: addressId,
  line1: '12, MG Road',
  city: 'Jaipur',
  pincode: '302001',
  lat: 26.9124,
  lng: 75.7873,
  match_type: 'house',
  source: 'geocoded',
  accuracy_m: 25,
  is_default: true,
  label: 'Home',
};
const orderRow = (quote, externalId) => ({
  external_id: externalId,
  user_id: shopUserId,
  customer_user_id: userId,
  status: 'NEW',
  items: quote.items,
  total: quote.total,
  payment_method: 'COD',
  delivery_address: '12, MG Road, Jaipur, 302001',
  created_at: new Date(now).toISOString(),
  updated_at: new Date(now).toISOString(),
  channel: 'mcp',
});

function makeRepo({ phone = '+919876543210' } = {}) {
  let quote = null;
  let order = null;
  return {
    userId,
    loadEnabledShops: async () => [shop],
    getShop: async (id) => (id === 'shop_one' ? shop : null),
    getShopByUserId: async (id) => (id === shopUserId
      ? { user_id: shopUserId, store_name: 'Shop One', public_shop_id: 'shop_one', mcp_enabled: true, orders_paused: false }
      : null),
    getCatalog: async () => catalog,
    getProfile: async () => ({ full_name: 'Asha', phone }),
    saveProfile: async ({ fullName, phone: p }) => ({ full_name: fullName, phone: p }),
    listAddresses: async () => [],
    getAddressRow: async (id) => (id === addressId ? address : null),
    saveAddress: async () => address,
    deleteAddress: async () => ({ deleted: true }),
    createQuote: async (row) => {
      quote = {
        id: quoteId,
        user_id: row.userId,
        shop_user_id: row.shopUserId,
        address_snapshot: row.address,
        items: row.items,
        total: row.total,
        payment_method: row.paymentMethod,
        notes: row.notes,
        expires_at: row.expiresAt,
        consumed_at: null,
      };
      return quote;
    },
    getQuote: async (id) => (quote && quote.id === id ? quote : null),
    usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
    placeOrder: async ({ quoteId: id, externalId }) => {
      if (!quote || quote.id !== id) throw new DataError('quote_not_found', 'missing');
      if (quote.consumed_at && order) return order;
      quote.consumed_at = new Date(now).toISOString();
      order = orderRow(quote, externalId);
      return order;
    },
    getOrder: async (id) => (order && order.external_id === id ? order : null),
    listOrders: async () => (order ? [order] : []),
    cancelOrder: async (id) => {
      if (!order || order.external_id !== id) throw new DataError('order_not_found', 'missing');
      if (order.status === 'CANCELLED') return order;
      if (order.status !== 'NEW') throw new DataError('cannot_cancel', 'already accepted');
      order.status = 'CANCELLED';
      return order;
    },
  };
}

const config = {
  supabaseUrl: 'http://localhost:54321',
  serviceKey: 'service',
  anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp',
  issuer: 'http://localhost:54321/auth/v1',
  googleKey: '',
  geocoderProvider: 'nominatim',
  enabled: true,
  allowInsecure: true,
  documentationUrl: 'https://dukaan.ai/connect',
  expectedResource: '',
  allowedOrigins: [],
};

async function connect(repo, options = {}) {
  const server = createServerFactory({ ...config, enabled: options.enabled !== false }, {
    repo,
    now: () => now,
    randomBytes: () => Buffer.from('a1b2c3', 'hex'),
    fetchImpl: options.fetchImpl || (async () => { throw new Error('network should not be called'); }),
  })({ authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

const { client, server } = await connect(makeRepo());

const shops = await client.callTool({ name: 'find_shops', arguments: { latitude: 26.9124, longitude: 75.7873 } });
assert.strictEqual(shops.isError, undefined);
assert.strictEqual(shops.structuredContent.shops.length, 1);
assert.strictEqual(shops.structuredContent.shops[0].shop_id, 'shop_one');
assert.strictEqual(shops.structuredContent.shops[0].distance_km, 0);
ok('find_shops returns a serviceable nearby shop');

const noMatch = await client.callTool({ name: 'find_shops', arguments: { latitude: 26.9124, longitude: 75.7873, query: 'no such shop' } });
assert.strictEqual(noMatch.isError, true);
assert.strictEqual(noMatch.structuredContent.code, 'no_matching_shops');
ok('find_shops distinguishes a name miss from an out-of-range address');

const queryWithoutLocation = await client.callTool({ name: 'find_shops', arguments: { query: 'Barli ji biscuit' } });
assert.strictEqual(queryWithoutLocation.isError, true);
assert.strictEqual(queryWithoutLocation.structuredContent.code, 'location_required');
assert.match(queryWithoutLocation.content[0].text, /search_products/);
ok('find_shops explains that query is not a product search and needs a location');

const outOfRange = await client.callTool({ name: 'find_shops', arguments: { latitude: 28.6139, longitude: 77.209 } });
assert.strictEqual(outOfRange.isError, true);
assert.strictEqual(outOfRange.structuredContent.code, 'out_of_range');
ok('find_shops fails closed outside the delivery radius');

const products = await client.callTool({ name: 'search_products', arguments: { shop_id: 'shop_one', query: 'milk' } });
assert.strictEqual(products.structuredContent.products[0].productId, 'milk');
assert.strictEqual(products.structuredContent.products[0].price, '₹27');
ok('search_products returns authoritative catalog prices');

const quote = await client.callTool({
  name: 'quote_order',
  arguments: {
    shop_id: 'shop_one',
    address_id: addressId,
    items: [{ product_id: 'milk', quantity: 2 }, { product_id: 'bread', quantity: 1 }],
  },
});
assert.strictEqual(quote.isError, undefined);
assert.strictEqual(quote.structuredContent.total, 99);
assert.strictEqual(quote.structuredContent.requires_confirmation, true);
assert.strictEqual(quote.structuredContent.shop.item_count, 2);
assert.strictEqual(quote.structuredContent.quote_id, quoteId);
assert.match(quote.content[0].text, /ask the customer to confirm/i);
ok('quote_order prices a draft and demands confirmation');

const checkout = await client.callTool({ name: 'show_checkout', arguments: { quote_id: quoteId } });
assert.strictEqual(checkout.isError, undefined);
assert.strictEqual(checkout.structuredContent.quote.quote_id, quoteId);
assert.strictEqual(checkout.structuredContent.quote.total_display, '₹99');
ok('show_checkout renders the same quote without placing it');

const unconfirmed = await client.callTool({ name: 'place_order', arguments: { quote_id: quoteId, confirmed: false } });
assert.strictEqual(unconfirmed.isError, true);
ok('place_order rejects an unconfirmed call at the schema boundary');

const placed = await client.callTool({ name: 'place_order', arguments: { quote_id: quoteId, confirmed: true } });
assert.strictEqual(placed.isError, undefined);
assert.match(placed.structuredContent.order.order_id, /^MCP-20261026-A1B2C3$/);
assert.strictEqual(placed.structuredContent.order.status, 'NEW');
ok('place_order creates one order from the quote');

const retried = await client.callTool({ name: 'place_order', arguments: { quote_id: quoteId, confirmed: true } });
assert.strictEqual(retried.structuredContent.order.order_id, placed.structuredContent.order.order_id);
ok('a retried place_order returns the same order');

const fetched = await client.callTool({ name: 'get_order', arguments: { order_id: placed.structuredContent.order.order_id } });
assert.strictEqual(fetched.structuredContent.order.status_label, 'Waiting for the shop to accept');
ok('get_order returns the customer status');

const cancelled = await client.callTool({ name: 'cancel_order', arguments: { order_id: placed.structuredContent.order.order_id } });
assert.strictEqual(cancelled.structuredContent.order.status, 'CANCELLED');
ok('cancel_order cancels before the shop accepts');

const cancelledAgain = await client.callTool({ name: 'cancel_order', arguments: { order_id: placed.structuredContent.order.order_id } });
assert.strictEqual(cancelledAgain.structuredContent.order.status, 'CANCELLED');
ok('cancel_order is idempotent after cancellation');

const retryCancelled = await client.callTool({ name: 'place_order', arguments: { quote_id: quoteId, confirmed: true } });
assert.strictEqual(retryCancelled.isError, undefined);
assert.strictEqual(retryCancelled.structuredContent.already_placed, true);
assert.match(retryCancelled.content[0].text, /already placed/i);
ok('a terminal replayed quote is not announced as a new order');

await client.close();
await server.close();

const geoFetch = async (url) => {
  assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
  return new Response(JSON.stringify([
    { lat: '26.9124', lon: '75.7873', display_name: 'Jaipur, Rajasthan, India', type: 'house', addresstype: 'house' },
  ]), { status: 200 });
};
const geo = await connect(makeRepo(), { fetchImpl: geoFetch });
const pincodeShops = await geo.client.callTool({ name: 'find_shops', arguments: { pincode: '302001' } });
assert.strictEqual(pincodeShops.isError, undefined);
assert.strictEqual(pincodeShops.structuredContent.shops.length, 1);
ok('find_shops geocodes a pincode through the configured provider');

const savedAddress = await geo.client.callTool({
  name: 'save_address',
  arguments: { line1: '12, MG Road', city: 'Jaipur', pincode: '302001' },
});
assert.strictEqual(savedAddress.isError, undefined);
assert.strictEqual(savedAddress.structuredContent.address.match_type, 'house');
ok('save_address geocodes address text instead of crashing on missing config');
await geo.client.close();
await geo.server.close();

const noPhone = await connect(makeRepo({ phone: null }));
const missingPhone = await noPhone.client.callTool({
  name: 'quote_order',
  arguments: { shop_id: 'shop_one', address_id: addressId, items: [{ product_id: 'milk', quantity: 1 }] },
});
assert.strictEqual(missingPhone.isError, true);
assert.strictEqual(missingPhone.structuredContent.code, 'phone_required');
await noPhone.client.close();
await noPhone.server.close();
ok('quote_order refuses to proceed without a delivery phone');

const paused = await connect(makeRepo(), { enabled: false });
const browsePaused = await paused.client.callTool({ name: 'find_shops', arguments: { latitude: 26.9124, longitude: 75.7873 } });
assert.strictEqual(browsePaused.isError, undefined);
const quotePaused = await paused.client.callTool({
  name: 'quote_order',
  arguments: { shop_id: 'shop_one', address_id: addressId, items: [{ product_id: 'milk', quantity: 1 }] },
});
assert.strictEqual(quotePaused.isError, true);
assert.strictEqual(quotePaused.structuredContent.code, 'service_paused');
await paused.client.close();
await paused.server.close();
ok('the kill switch pauses ordering while leaving discovery available');

console.log(`\nAll ${n} MCP tool-flow checks passed.`);
