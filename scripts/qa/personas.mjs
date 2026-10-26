import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../../mcp/server.js';
import { createResilientFetch, isSocketError } from '../../mcp/net.js';
import { publicOrder } from '../../mcp/data.js';
import { searchCatalog, toPublicProduct } from '../../mcp/catalog.js';

/**
 * Persona QA.
 *
 * Every persona below is a customer (or a failure) that the 2026-10-26 production
 * run, the transcript, or the plan named. They run against the real MCP server
 * with a fixture repo, so they exercise tool wiring, error codes, and the exact
 * strings an assistant will read — not just pure helpers.
 *
 *   node scripts/qa/personas.mjs
 */
const now = Date.UTC(2026, 9, 26, 21, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const shopUserId = '33333333-3333-4333-8333-333333333333';
const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const config = {
  supabaseUrl: 'http://localhost:54321', serviceKey: 'service', anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:54321/auth/v1',
  googleKey: '', geocoderProvider: 'nominatim', enabled: true, allowInsecure: true,
  documentationUrl: '', expectedResource: '', allowedOrigins: [],
};

const appLocation = {
  location_lat: 26.9091549, location_lng: 75.1845856, location_accuracy_m: 43,
  location_source: 'gps', location_captured_at: new Date(now - 60_000).toISOString(),
};

const catalogRows = [
  { external_id: 'p_soap', name: 'Lifeboy Soap', price: '₹40', stock: 3, stock_unit: 'units', image_url: 'https://via.placeholder.com/150' },
  { external_id: 'p_dettol', name: 'Dettol Original Soap (125g)', price: '₹55', stock: 90, stock_unit: 'bars', image_url: 'https://example.test/d.jpg' },
  { external_id: 'p_milk', name: 'Amul Gold Milk (1L)', price: '₹68', stock: 30, stock_unit: 'cartons', image_url: 'https://example.test/m.jpg' },
  { external_id: 'p_zero', name: 'Zero Price Soap', price: '₹0', stock: 5, stock_unit: 'units', image_url: null },
];

function makeRepo(overrides = {}) {
  const state = { quotes: [], orders: [], savedAddresses: [], calls: [] };
  const repo = {
    userId,
    state,
    getProfile: async () => ({ full_name: 'Raj Sharma', phone: '+917678798767', ...(overrides.location === null ? {} : appLocation), ...(overrides.profile || {}) }),
    saveProfile: async ({ fullName, phone }) => ({ full_name: fullName, phone }),
    saveLocation: async (fields) => { state.calls.push(['saveLocation', fields]); return {}; },
    listAddresses: async () => state.savedAddresses,
    getAddressRow: async (id) => state.savedAddresses.find((row) => row.address_id === id) || null,
    saveAddress: async (fields) => {
      const saved = {
        ...fields,
        // The tool always sends address_id, as undefined for a create; spreading
        // after it would erase the generated id and make the quote unfindable.
        address_id: fields.address_id || addressId,
        label: fields.label || null,
        address: [fields.line1, fields.city, fields.pincode].filter(Boolean).join(', '),
        match_type: fields.match_type,
        precision_source: fields.precision_source,
        geocode_verified: fields.geocode_verified,
        maps_url: `https://maps.google.com/?q=${fields.lat},${fields.lng}`,
      };
      state.savedAddresses = [saved, ...state.savedAddresses.filter((row) => row.address_id !== saved.address_id)];
      return saved;
    },
    deleteAddress: async () => ({ deleted: true }),
    getShop: async () => overrides.shop || null,
    getShopByUserId: async () => ({ user_id: shopUserId, store_name: 'Ramu General Store', public_shop_id: 'shop_a', mcp_enabled: true, orders_paused: false }),
    getCatalog: async () => catalogRows.map(toPublicProduct).filter(Boolean),
    loadEnabledShops: async () => state.calls.push(['loadEnabledShops']),
    findShopsNearby: async (fields) => {
      state.calls.push(['findShopsNearby', fields]);
      return overrides.nearby ? overrides.nearby(fields) : [];
    },
    searchNearbyProducts: async (fields) => {
      state.calls.push(['searchNearbyProducts', fields]);
      return overrides.nearbyProducts ? overrides.nearbyProducts(fields) : [];
    },
    usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
    findRecentQuote: async (hash, since) => state.quotes.find((q) => q.request_hash === hash && !q.consumed_at && q.created_at >= since) || null,
    createQuote: async (fields) => {
      const quote = {
        // The tool schema requires a UUID; a readable id would fail validation.
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(state.quotes.length + 1).padStart(12, '0')}`, ...fields,
        request_hash: fields.requestHash, address_snapshot: fields.address,
        consumed_at: null, created_at: new Date(now).toISOString(),
      };
      state.quotes.push(quote);
      return quote;
    },
    getQuote: async (id) => state.quotes.find((q) => q.id === id) || null,
    placeOrder: async ({ quoteId, externalId }) => {
      const quote = state.quotes.find((q) => q.id === quoteId);
      if (!quote) throw Object.assign(new Error('quote_not_found'), { code: 'quote_not_found' });
      const existing = state.orders.find((o) => o.quote_id === quoteId);
      if (existing) return existing;
      const row = {
        external_id: externalId, user_id: shopUserId, customer_user_id: userId,
        status: 'NEW', items: quote.items, total: quote.total, payment_method: 'COD',
        delivery_address: quote.address_snapshot.address, channel: 'mcp', quote_id: quoteId,
        customer: {
          name: quote.address_snapshot.name, whatsappNumber: quote.address_snapshot.phone,
          address: quote.address_snapshot.address, mapsUrl: quote.address_snapshot.mapsUrl,
          latitude: quote.address_snapshot.lat, longitude: quote.address_snapshot.lng,
        },
        created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
      };
      quote.consumed_at = new Date(now).toISOString();
      state.orders.push(row);
      return row;
    },
    getOrder: async (id) => state.orders.find((o) => o.external_id === id) || null,
    listOrders: async (limit) => state.orders.slice(0, limit),
    cancelOrder: async () => ({ status: 'CANCELLED' }),
  };
  return repo;
}

async function connect(repo, options = {}) {
  const server = createServerFactory(config, { repo, now: () => now, randomBytes: () => Buffer.from('a1b2c3', 'hex'), ...options })({
    authInfo: { token: 't', clientId: 'qa', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'persona-qa', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(ct), server.connect(st)]);
  return { client, server };
}

async function tool(repo, name, args = {}, options) {
  const { client, server } = await connect(repo, options);
  const res = await client.callTool({ name, arguments: args });
  await client.close();
  await server.close();
  return res;
}

const results = [];
async function persona(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, name, status: 'PASS', detail: detail || '' });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', detail: String(error?.message || error) });
  }
}

const oneShop = { shopId: 'shop_a', userId: shopUserId, name: 'Ramu General Store', latitude: 26.9092, longitude: 75.1846, distanceKm: 0.1, deliveryRadiusKm: 5, catalogItemCount: 4, mcpEnabled: true, ordersPaused: false };
const nearbyRows = [
  { shopId: 'shop_a', userId: shopUserId, shopName: 'Ramu General Store', shopLatitude: 26.9092, shopLongitude: 75.1846, distanceKm: 0.1, productId: 'p_soap', productName: 'Lifeboy Soap', price: '��40', unit: 'unit', stock: 3 },
  { shopId: 'shop_b', userId: 'u2', shopName: 'Sharma Kirana', shopLatitude: 26.9095, shopLongitude: 75.185, distanceKm: 0.6, productId: 'p_dettol', productName: 'Dettol Original Soap (125g)', price: '₹55', unit: 'bar', stock: 90 },
];

// P1 — the transcript replay.
await persona('P1', 'Kirana regular (transcript replay)', async () => {
  const repo = makeRepo({ nearby: () => [oneShop], nearbyProducts: () => nearbyRows, shop: { ...oneShop, catalogItemCount: 4 } });
  const shops = await tool(repo, 'find_shops', { limit: 5 });
  assert.strictEqual(shops.isError, undefined, shops.content?.[0]?.text);
  assert.strictEqual(shops.structuredContent.location.source, 'app_location');
  const found = await tool(repo, 'find_products_nearby', { query: 'soap' });
  assert.strictEqual(found.isError, undefined);
  await tool(repo, 'save_customer_profile', { full_name: 'Raj Sharma', phone: '7678798767' });
  const address = await tool(repo, 'save_address', { line1: '29, infront of hospital', city: 'Sambhar', pincode: '303604', is_default: true });
  assert.strictEqual(address.isError, undefined, 'the address saves without any geocoder');
  const quoted = await tool(repo, 'quote_order', { shop_id: 'shop_a', address_id: addressId, items: [{ product_id: 'p_soap', quantity: 2 }] });
  assert.strictEqual(quoted.isError, undefined, quoted.content?.[0]?.text);
  const placed = await tool(repo, 'place_order', { quote_id: quoted.structuredContent.quote_id, confirmed: true });
  assert.strictEqual(placed.isError, undefined);
  const order = publicOrder(repo.state.orders[0]);
  assert.strictEqual(order.customer.name, 'Raj Sharma');
  assert.match(order.customer.whatsappNumber, /^\+917678798767$/);
  assert.ok(order.customer.mapsUrl);
  return 'order placed with every POS field';
});

// P2 — no location, pincode only.
await persona('P2', 'First-timer denies location, gives a pincode', async () => {
  const repo = makeRepo({
    location: null,
    nearby: (fields) => (fields.lat ? [oneShop] : []),
  });
  const geo = async () => new Response(JSON.stringify([
    { lat: '26.91', lon: '75.18', display_name: 'Sambhar, Rajasthan, India', type: 'city', addresstype: 'city' },
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const res = await tool(repo, 'find_shops', { pincode: '303604' }, { fetchImpl: geo });
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  assert.strictEqual(res.structuredContent.location.source, 'geocoded');
  // Nominatim's city result maps to our area level, which is deliverable with a
  // confirmation call — the same rule the POS applies. Only `city` is refused.
  assert.strictEqual(res.structuredContent.location.match_type, 'area');
  assert.strictEqual(res.structuredContent.location.needs_exact_address, false);
  return 'pincode geocode finds shops at area level';
});

// P3 — Hinglish.
await persona('P3', 'Hinglish "sabun"', async () => {
  const repo = makeRepo({ nearbyProducts: (fields) => (fields.tokens.includes('soap') ? nearbyRows : []) });
  const res = await tool(repo, 'find_products_nearby', { query: 'sabun 2 pack' });
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  return 'sabun expands to soap';
});

// P4 — dense area, third shop has it.
await persona('P4', 'Three shops, only the farthest stocks soap', async () => {
  const repo = makeRepo({
    nearby: () => [{ ...oneShop, shopId: 'shop_a', distanceKm: 0.1 }, { ...oneShop, shopId: 'shop_b', distanceKm: 0.6 }],
    nearbyProducts: () => [nearbyRows[1]],
  });
  const res = await tool(repo, 'find_products_nearby', { query: 'soap' });
  assert.strictEqual(res.structuredContent.shops[0].shop_id, 'shop_b', 'the shop that has it, not the nearest shop');
  return 'picks the nearest shop that actually stocks it';
});

// P5 — out of range.
await persona('P5', 'Customer 23 km from every shop', async () => {
  const repo = makeRepo({ nearby: (f) => (Number(f.radiusKm) > 100 ? [{ ...oneShop, distanceKm: 23.4 }] : []) });
  const res = await tool(repo, 'find_shops', {});
  assert.strictEqual(res.structuredContent.code, 'out_of_range');
  assert.strictEqual(res.structuredContent.details.nearest_km, 23.4);
  return 'reports 23.4 km, orders nothing';
});

// P6 — merchant edges.
await persona('P6', 'Catalog with a zero price and a sold-out row', async () => {
  const products = catalogRows.map(toPublicProduct).filter(Boolean);
  assert.ok(!products.some((p) => p.productId === 'p_zero'), 'a ₹0 row cannot be sold');
  const found = searchCatalog(products, 'soap');
  assert.strictEqual(found[0].productId, 'p_dettol', 'the well-stocked soap ranks first');
  assert.strictEqual(found[0].imageUrl?.startsWith('https://'), true, 'a real image survives');
  const placeholder = products.find((p) => p.productId === 'p_soap');
  assert.strictEqual(placeholder.imageUrl, null, 'a placeholder image is dropped');
  return 'invalid price hidden, stock-aware order, placeholder dropped';
});

// P7 — adversary.
await persona('P7', 'Forged precision, replayed quote, expired quote', async () => {
  const repo = makeRepo({ nearby: () => [oneShop], shop: { ...oneShop, catalogItemCount: 4 } });
  const forged = await tool(repo, 'save_address', { line1: '29, infront of hospital', pincode: '303604', latitude: 26.9, longitude: 75.18, source: 'geocoded' });
  assert.strictEqual(forged.structuredContent.address.precision_source, 'chat_shared');
  assert.strictEqual(forged.structuredContent.address.match_type, 'street');
  const first = await tool(repo, 'quote_order', { shop_id: 'shop_a', address_id: addressId, items: [{ product_id: 'p_soap', quantity: 2 }] });
  const replay = await tool(repo, 'quote_order', { shop_id: 'shop_a', address_id: addressId, items: [{ product_id: 'p_soap', quantity: 2 }] });
  assert.strictEqual(replay.structuredContent.quote_id, first.structuredContent.quote_id, 'a retry reuses the quote');
  await tool(repo, 'place_order', { quote_id: first.structuredContent.quote_id, confirmed: true });
  const again = await tool(repo, 'place_order', { quote_id: first.structuredContent.quote_id, confirmed: true });
  assert.strictEqual(again.isError, undefined, again.content?.[0]?.text);
  assert.strictEqual(again.structuredContent.order.order_id, repo.state.orders[0].external_id, 'a duplicate place returns the same order');
  return 'pin downgraded, quote reused, order idempotent';
});

// P8 — flaky network.
await persona('P8', 'Socket dies once mid-write', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
    return new Response('{}', { status: 200 });
  };
  assert.strictEqual(isSocketError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), true);
  const res = await createResilientFetch({ fetchImpl: flaky })('https://example.test/rest/v1/order_quotes');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls, 2);
  return 'one retry recovers the request';
});

// P9 — stale location.
await persona('P9', 'Location captured 45 days ago', async () => {
  const repo = makeRepo({
    location: null,
    profile: { location_lat: 26.9, location_lng: 75.18, location_accuracy_m: 43, location_source: 'gps', location_captured_at: new Date(now - 45 * 86400000).toISOString() },
  });
  const res = await tool(repo, 'find_shops', {});
  assert.strictEqual(res.structuredContent.code, 'location_stale');
  assert.match(res.content[0].text, /45 days old/);
  return 'refuses to guess from a stale fix and says why';
});

// P10 — non-technical.
await persona('P10', 'Non-technical customer, no location at all', async () => {
  const repo = makeRepo({ location: null });
  const res = await tool(repo, 'find_shops', {});
  assert.strictEqual(res.structuredContent.code, 'location_required');
  assert.ok(!/at |Error:|stack/i.test(res.content[0].text), 'no stack trace reaches the customer');
  return 'one clear question, no internals';
});

const width = Math.max(...results.map((r) => r.name.length));
console.log('\n  DUKAAN MCP PERSONA QA\n');
for (const row of results) {
  console.log(`  [${row.status}] ${row.id.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
}
const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n  ${results.length - failed.length} pass, ${failed.length} fail\n`);
if (failed.length > 0) process.exit(1);
