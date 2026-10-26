import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';

/**
 * Task 7 makes a dead socket retryable. That is only safe if the retried tool
 * call cannot create a second row. `place_order` is already idempotent through
 * the quote RPC; `quote_order` was not: a retry after a lost response created a
 * second quote, which consumes the customer's hourly preview budget and leaves
 * the assistant holding a quote id nobody will use.
 *
 * The same basket for the same shop and address inside 60 seconds returns the
 * quote that already exists, marked `reused: true`. A different basket is a
 * different request, and a quote the customer already turned into an order is
 * never resurrected.
 */
console.log('--- RUNNING MCP QUOTE IDEMPOTENCY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 18, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const shopUserId = '33333333-3333-4333-8333-333333333333';
const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
  shopId: 'shop_one',
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
  { productId: 'prod_soap', name: 'Lifeboy Soap', pricePaise: 4000, price: '₹40', unit: 'bars', category: 'General', inStock: true, stock: 9 },
];
const address = {
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
};

function makeRepo() {
  const stored = [];
  const calls = { created: 0, looked: 0 };
  return {
    calls,
    stored,
    userId,
    getShop: async () => shop,
    getCatalog: async () => catalog,
    getProfile: async () => ({ full_name: 'Raj Sharma', phone: '+917678798767' }),
    getAddressRow: async (id) => (id === addressId ? address : null),
    listAddresses: async () => [],
    usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
    // Mirrors data.findRecentQuote: unconsumed, unexpired, inside the window.
    findRecentQuote: async (hash, sinceIso) => {
      calls.looked += 1;
      const match = stored.find(
        (row) => row.request_hash === hash && !row.consumed_at && row.created_at >= sinceIso
      );
      return match ? { ...match } : null;
    },
    createQuote: async (row) => {
      calls.created += 1;
      const saved = {
        id: `quote-${calls.created}`,
        user_id: userId,
        shop_user_id: shopUserId,
        request_hash: row.requestHash,
        address_snapshot: row.address,
        items: row.items,
        total: row.total,
        payment_method: row.paymentMethod,
        notes: row.notes,
        expires_at: row.expiresAt,
        consumed_at: null,
        created_at: new Date(now).toISOString(),
      };
      stored.push(saved);
      return saved;
    },
  };
}

async function connect(repo) {
  const server = createServerFactory(config, { repo, now: () => now })({
    authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'idempotency-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

const basket = (quantity) => ({
  shop_id: shop.shopId,
  address_id: addressId,
  items: [{ product_id: 'prod_soap', quantity }],
});

// ── 1. The same basket twice is one quote ──────────────────────────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const first = await client.callTool({ name: 'quote_order', arguments: basket(2) });
  const second = await client.callTool({ name: 'quote_order', arguments: basket(2) });
  assert.strictEqual(first.isError, undefined);
  assert.strictEqual(second.isError, undefined);
  assert.strictEqual(second.structuredContent.quote_id, first.structuredContent.quote_id, 'the retry reuses the quote');
  assert.strictEqual(second.structuredContent.reused, true);
  assert.strictEqual(first.structuredContent.reused, false);
  assert.strictEqual(repo.calls.created, 1, 'one row, not two');
  assert.strictEqual(second.structuredContent.total_display, '₹80');
  assert.match(second.structuredContent.confirmation, /Lifeboy Soap × 2/);
  await client.close();
  await server.close();
  ok('an identical retry returns the same quote instead of creating a second row');
}

// ── 2. A different basket is a different quote ─────────────────────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const two = await client.callTool({ name: 'quote_order', arguments: basket(2) });
  const three = await client.callTool({ name: 'quote_order', arguments: basket(3) });
  assert.notStrictEqual(three.structuredContent.quote_id, two.structuredContent.quote_id);
  assert.strictEqual(repo.calls.created, 2);
  await client.close();
  await server.close();
  ok('a different quantity creates a new quote');
}

// ── 3. A quote that became an order is never reused ────────────────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const first = await client.callTool({ name: 'quote_order', arguments: basket(2) });
  repo.stored[0].consumed_at = new Date(now).toISOString();
  const again = await client.callTool({ name: 'quote_order', arguments: basket(2) });
  assert.notStrictEqual(again.structuredContent.quote_id, first.structuredContent.quote_id);
  assert.strictEqual(repo.calls.created, 2);
  assert.strictEqual(again.structuredContent.reused, false);
  await client.close();
  await server.close();
  ok('a consumed quote is not resurrected by a retry');
}

console.log(`\nAll ${n} quote idempotency checks passed.`);
