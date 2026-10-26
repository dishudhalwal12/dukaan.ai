import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';
import { createQuote } from '../mcp/data.js';

/**
 * Fixes from the whole-branch review.
 *
 *   R1 (Critical) quote idempotency was a check-then-insert. Two identical
 *      requests in the same second, or a transparent POST retry, both saw
 *      "no quote" and both inserted. The database has to decide.
 *   R2 (Important) editing only whitespace re-derived the coordinate from the
 *      app location and dropped a verified geocode, because the text comparison
 *      did not trim while the stored value did.
 *   R3 (Important) the request hash ignored the address text and the note, so a
 *      re-quote after editing them reused a quote whose stored snapshot was the
 *      OLD address — the confirmation showed text the order would not carry.
 *   R4 (Minor) quote_order still advertised idempotentHint: false.
 */
console.log('--- RUNNING MCP REVIEW-FIX TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 19, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const shopUserId = '33333333-3333-4333-8333-333333333333';
const addressId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const shop = {
  shopId: 'shop_one', userId: shopUserId, name: 'Ramu General Store',
  latitude: 26.9092, longitude: 75.1846, catalogItemCount: 1, deliveryRadiusKm: 5,
  mcpEnabled: true, ordersPaused: false,
};
const catalog = [
  { productId: 'prod_soap', name: 'Lifeboy Soap', pricePaise: 4000, price: '₹40', unit: 'bars', category: 'General', inStock: true, stock: 9 },
];
const verifiedAddress = {
  id: addressId, line1: '29, infront of hospital', city: 'Sambhar', pincode: '303604',
  lat: 26.9091549, lng: 75.1845856, accuracy_m: 12, match_type: 'house',
  source: 'geocoded', precision_source: 'geocoded', geocode_verified: true,
};
const appLocation = {
  location_lat: 26.90, location_lng: 75.18, location_accuracy_m: 43,
  location_source: 'gps', location_captured_at: new Date(now - 60_000).toISOString(),
};

// ── R1: the database decides who wins the race ─────────────────────────────
{
  // A stub that behaves like PostgREST for the two calls createQuote makes:
  // the INSERT loses the unique race, then the follow-up SELECT finds the
  // winner. Without the catch, the customer sees a failed quote.
  const winner = {
    id: 'quote-winner', user_id: userId, shop_user_id: shopUserId,
    request_hash: 'hash-1', address_snapshot: {}, items: [], total: 80,
    payment_method: 'COD', notes: null, expires_at: new Date(now + 600_000).toISOString(),
    consumed_at: null, created_at: new Date(now).toISOString(),
  };
  let inserts = 0;
  const db = {
    from() {
      const api = {
        insert() { inserts += 1; return api; },
        select() { return api; },
        eq() { return api; },
        is() { return api; },
        gte() { return api; },
        order() { return api; },
        limit() { return api; },
        single() {
          // The unique partial index from 2026-10-30 rejects the duplicate.
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "order_quotes_request_hash_key"' } });
        },
        maybeSingle() {
          return Promise.resolve({ data: winner, error: null });
        },
      };
      return api;
    },
  };
  const saved = await createQuote(db, {
    userId, shopUserId, address: {}, items: [], total: 80, paymentMethod: 'COD', expiresAt: winner.expires_at, requestHash: 'hash-01',
  });
  assert.strictEqual(inserts, 1, 'the insert is attempted once');
  assert.strictEqual(saved.id, 'quote-winner', 'the loser of the race returns the winner, not an error');
  ok('a duplicate insert returns the existing quote instead of failing');
}

// ── shared harness for the tool-level cases ────────────────────────────────
const config = {
  supabaseUrl: 'http://localhost:54321', serviceKey: 'service', anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:54321/auth/v1',
  googleKey: '', geocoderProvider: 'nominatim', enabled: true, allowInsecure: true,
  documentationUrl: '', expectedResource: '', allowedOrigins: [],
};

function makeRepo({ address = verifiedAddress } = {}) {
  const stored = [];
  const calls = { created: 0, saved: [] };
  return {
    calls, stored, userId,
    getShop: async () => shop,
    getCatalog: async () => catalog,
    getProfile: async () => ({ full_name: 'Raj Sharma', phone: '+917678798767', ...appLocation }),
    getAddressRow: async (id) => (id === addressId ? address : null),
    listAddresses: async () => [],
    saveProfile: async ({ fullName, phone }) => ({ full_name: fullName, phone }),
    saveLocation: async () => ({}),
    saveAddress: async (fields) => { calls.saved.push(fields); return { ...address, ...fields }; },
    usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
    findRecentQuote: async (hash, sinceIso) => stored.find(
      (row) => row.request_hash === hash && !row.consumed_at && row.created_at >= sinceIso
    ) || null,
    createQuote: async (row) => {
      calls.created += 1;
      const saved = {
        id: `quote-${calls.created}`, user_id: userId, shop_user_id: shopUserId,
        request_hash: row.requestHash, address_snapshot: row.address, items: row.items,
        total: row.total, payment_method: row.paymentMethod, notes: row.notes,
        expires_at: row.expiresAt, consumed_at: null, created_at: new Date(now).toISOString(),
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
  const client = new Client({ name: 'review-fix-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

// ── R2: a whitespace edit must not launder a verified address ──────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const res = await client.callTool({
    name: 'save_address',
    arguments: { address_id: addressId, label: 'Home', line1: '  29, infront of hospital  ' },
  });
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  const saved = repo.calls.saved[0];
  assert.strictEqual(saved.geocode_verified, true, 'verification survives a whitespace edit');
  assert.strictEqual(saved.precision_source, 'geocoded');
  assert.strictEqual(saved.match_type, 'house');
  await client.close();
  await server.close();
  ok('re-submitting the same text with extra spaces keeps its verification');
}

// ── R3: the address text and the note are part of "the same request" ───────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const base = { shop_id: shop.shopId, address_id: addressId, items: [{ product_id: 'prod_soap', quantity: 2 }] };
  const first = await client.callTool({ name: 'quote_order', arguments: base });
  const withNote = await client.callTool({ name: 'quote_order', arguments: { ...base, customer_note: 'Ring the bell twice' } });
  if (process.env.DEBUG_REVIEW_FIX) console.error('DEBUG ids', first.structuredContent?.quote_id, withNote.structuredContent?.quote_id, 'created', repo.calls.created);
  assert.notStrictEqual(
    withNote.structuredContent.quote_id,
    first.structuredContent.quote_id,
    'a note changes the order, so it needs its own quote'
  );
  await client.close();
  await server.close();

  // Same address_id, but the customer fixed a house number between the two
  // quotes. The quote must follow the text, not the id.
  const changedText = makeRepo();
  const { client: c2, server: s2 } = await connect(changedText);
  const beforeEdit = await c2.callTool({ name: 'quote_order', arguments: base });
  changedText.getAddressRow = async () => ({ ...verifiedAddress, line1: '31, infront of hospital' });
  const afterEdit = await c2.callTool({ name: 'quote_order', arguments: base });
  if (process.env.DEBUG_REVIEW_FIX) console.error('DEBUG text', beforeEdit.structuredContent?.quote_id, afterEdit.structuredContent?.quote_id, 'created', changedText.calls.created);
  assert.notStrictEqual(afterEdit.structuredContent.quote_id, beforeEdit.structuredContent.quote_id);
  await c2.close();
  await s2.close();
  ok('a changed note or address line produces a fresh quote, never a stale snapshot');
}

// ── R4: the tool advertises what it now guarantees ────────────────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const { tools } = await client.listTools();
  const quoteOrder = tools.find((tool) => tool.name === 'quote_order');
  assert.strictEqual(quoteOrder.annotations?.idempotentHint, true, 'a retry is safe, so say so');
  await client.close();
  await server.close();
  ok('quote_order tells clients that retrying it is safe');
}

console.log(`\nAll ${n} review-fix checks passed.`);
