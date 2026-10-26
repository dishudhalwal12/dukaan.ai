import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory, SERVER_INSTRUCTIONS } from '../mcp/server.js';

/**
 * The tool that makes 10k shops workable: one call answers "which shop near me
 * has soap, and at what price" instead of find_shops plus a search per shop.
 *
 * It must group by shop, keep the nearest shop first, carry prices the quote can
 * trust, expand plain English to the Hindi shelf word, and refuse politely when
 * nothing nearby stocks the item.
 */
console.log('--- RUNNING MCP NEARBY-PRODUCTS TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 20, 30, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const config = {
  supabaseUrl: 'http://localhost:54321', serviceKey: 'service', anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:54321/auth/v1',
  googleKey: '', geocoderProvider: 'nominatim', enabled: true, allowInsecure: true,
  documentationUrl: '', expectedResource: '', allowedOrigins: [],
};

const row = (shopId, shopName, km, productId, productName, price, stock) => ({
  shopId, userId: `u-${shopId}`, shopName, shopLatitude: 26.9092, shopLongitude: 75.1846,
  distanceKm: km, productId, productName, price, unit: 'bars', stock,
});

function makeRepo(rows) {
  const calls = [];
  return {
    calls,
    userId,
    getProfile: async () => ({
      location_lat: 26.9091549, location_lng: 75.1845856, location_accuracy_m: 43,
      location_source: 'gps', location_captured_at: new Date(now - 60_000).toISOString(),
    }),
    searchNearbyProducts: async (fields) => {
      calls.push(fields);
      return rows;
    },
  };
}

async function call(repo, args) {
  const server = createServerFactory(config, { repo, now: () => now })({
    authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'nearby-products-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const res = await client.callTool({ name: 'find_products_nearby', arguments: args });
  await client.close();
  await server.close();
  return res;
}

// ── 1. Shops that stock it, nearest first, with prices ─────────────────────
{
  const repo = makeRepo([
    row('shop_a', 'Ramu General Store', 0.1, 'p1', 'Lifeboy Soap', '₹40', 3),
    row('shop_b', 'Sharma Kirana', 0.6, 'p2', 'Dettol Original Soap (125g)', '₹55', 90),
    row('shop_b', 'Sharma Kirana', 0.6, 'p3', 'Lux Soap', '₹30', 12),
  ]);
  const res = await call(repo, { query: 'soap' });
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  const shops = res.structuredContent.shops;
  assert.strictEqual(shops.length, 2, 'one entry per shop, not per product');
  assert.strictEqual(shops[0].shop_id, 'shop_a', 'nearest shop first');
  assert.strictEqual(shops[0].distance_km, 0.1);
  assert.strictEqual(shops[0].items[0].name, 'Lifeboy Soap');
  assert.strictEqual(shops[0].items[0].price, '₹40');
  assert.strictEqual(shops[1].items.length, 2, 'both of the farther shop’s soaps are listed');
  assert.match(res.content[0].text, /Ramu General Store/);
  assert.match(res.content[0].text, /₹40/);
  ok('one call returns the nearest shops that stock the item, with prices');
}

// ── 2. The Hindi shelf word is included in the search ─────────────────────
{
  const repo = makeRepo([row('shop_a', 'Ramu General Store', 0.1, 'p1', 'Lifeboy Soap', '₹40', 3)]);
  await call(repo, { query: 'sabun' });
  const tokens = repo.calls[0].tokens;
  assert.ok(tokens.includes('sabun'), 'the query word is kept');
  assert.ok(tokens.includes('soap'), 'the English alias is added');
  ok('a Hinglish query searches both the word and its alias');
}

// ── 2b. A pack count is handed over, not guessed ──────────────────────────
{
  const repo = makeRepo([row('shop_a', 'Ramu General Store', 0.1, 'p1', 'Lifeboy Soap', '₹40', 3)]);
  const res = await call(repo, { query: 'lifeboy 2 pack' });
  assert.strictEqual(res.structuredContent.pack_size, 2);
  ok('a pack count in the query is returned as pack_size');
}

// ── 3. Nothing nearby stocks it ───────────────────────────────────────────
{
  const res = await call(makeRepo([]), { query: 'cement' });
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'no_matching_shops');
  assert.match(res.content[0].text, /nothing was ordered/i);
  ok('an unknown product fails cleanly, never with a guess');
}

// ── 4. The assistant is told to use it ────────────────────────────────────
{
  assert.match(SERVER_INSTRUCTIONS, /find_products_nearby/);
  assert.match(SERVER_INSTRUCTIONS, /one call|single call/i);
  ok('the instructions prefer one nearby search over one search per shop');
}

// ── 5. A deployment without the SQL search fails loudly ───────────────────
{
  const repo = makeRepo([]);
  delete repo.searchNearbyProducts;
  const res = await call(repo, { query: 'soap' });
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'unsupported');
  ok('a missing nearby search is an error, not a silent fallback');
}

console.log(`\nAll ${n} nearby-products checks passed.`);
