import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';

/**
 * The confirmation the assistant reads back must be exactly what the
 * shopkeeper's popup will show (src/types.ts `Order`): customer name, phone,
 * address, the item lines, the total, and the payment method — plus a map pin.
 * Building it server-side is what keeps a model from paraphrasing a total.
 */
console.log('--- RUNNING MCP QUOTE-CONFIRMATION TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 17, 40, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const shopUserId = '33333333-3333-4333-8333-333333333333';
const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quoteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  documentationUrl: '',
  expectedResource: '',
  allowedOrigins: [],
};

const shop = {
  shopId: 'shop_9f12b92510',
  userId: shopUserId,
  name: 'Ramu General Store',
  latitude: 26.9092,
  longitude: 75.1846,
  catalogItemCount: 1,
  deliveryRadiusKm: 5,
  mcpEnabled: true,
  ordersPaused: false,
};

const catalog = [
  { productId: 'prod_soap', name: 'Lifeboy Soap', pricePaise: 4000, price: '₹40', unit: 'bars', category: 'General', inStock: true, stock: 3 },
];

const baseAddress = {
  id: addressId,
  line1: '29, infront of hospital',
  city: 'Sambhar',
  pincode: '303604',
  lat: 26.9091549,
  lng: 75.1845856,
  accuracy_m: 43,
  match_type: 'street',
  source: 'map_pin',
  precision_source: 'app_location',
  geocode_verified: false,
  is_default: true,
};

function makeRepo({ address = baseAddress } = {}) {
  return {
    userId,
    getShop: async () => shop,
    getCatalog: async () => catalog,
    getProfile: async () => ({ full_name: 'Raj Sharma', phone: '+917678798767' }),
    getAddressRow: async (id) => (id === addressId ? address : null),
    listAddresses: async () => [],
    usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
    createQuote: async (row) => ({
      id: quoteId,
      user_id: userId,
      shop_user_id: shopUserId,
      address_snapshot: row.address,
      items: row.items,
      total: row.total,
      payment_method: row.paymentMethod,
      notes: row.notes,
      expires_at: row.expiresAt,
    }),
  };
}

async function quote(repo) {
  const server = createServerFactory(config, { repo, now: () => now })({
    authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'quote-confirmation-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const res = await client.callTool({
    name: 'quote_order',
    arguments: {
      shop_id: shop.shopId,
      address_id: addressId,
      items: [{ product_id: 'prod_soap', quantity: 2 }],
    },
  });
  await client.close();
  await server.close();
  return res;
}

// ── 1. The confirmation is rendered from data, not by the model ─────────────
{
  const res = await quote(makeRepo());
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  const data = res.structuredContent;
  assert.strictEqual(data.address_verified, false, 'a pin-backed address is not verified');
  assert.match(data.maps_url, /26\.9091549.*75\.1845856/);
  const card = data.confirmation;
  assert.match(card, /Raj Sharma/);
  assert.match(card, /\+917678798767/);
  assert.match(card, /29, infront of hospital/);
  assert.match(card, /Lifeboy Soap × 2/);
  assert.match(card, /80/);
  assert.match(card, /cash on delivery/i);
  assert.match(res.content[0].text, /Lifeboy Soap × 2/, 'the text carries the same lines the card does');
  ok('the quote returns a ready-to-read confirmation with every POS field');
}

// ── 2. A geocoded address is the one that reads as verified ────────────────
{
  const res = await quote(makeRepo({
    address: { ...baseAddress, precision_source: 'geocoded', geocode_verified: true, match_type: 'house' },
  }));
  assert.strictEqual(res.isError, undefined);
  assert.strictEqual(res.structuredContent.address_verified, true);
  ok('only a geocoded address is marked verified');
}

// ── 3. No coordinate means no quote ───────────────────────────────────────
{
  const res = await quote(makeRepo({ address: { ...baseAddress, lat: null, lng: null } }));
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'location_required');
  ok('an address without a map position cannot be quoted');
}

console.log(`\nAll ${n} quote-confirmation checks passed.`);
