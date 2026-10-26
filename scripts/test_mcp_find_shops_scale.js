import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';

/**
 * At 10 000 shops, `find_shops` must never load the registry. When the repo offers
 * the SQL search, it is the only path taken; the in-memory ranking is a test seam
 * for older fakes and must not be reachable in production.
 *
 * This pins the three outcomes the assistant depends on:
 *   - shops come back with the distance SQL computed;
 *   - an empty result with a name filter is "no matching shops";
 *   - an empty result without one is "out of range", and the message still tells
 *     the customer how far the nearest shop is.
 */
console.log('--- RUNNING MCP FIND-SHOPS SCALE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 20, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
const config = {
  supabaseUrl: 'http://localhost:54321', serviceKey: 'service', anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:54321/auth/v1',
  googleKey: '', geocoderProvider: 'nominatim', enabled: true, allowInsecure: true,
  documentationUrl: '', expectedResource: '', allowedOrigins: [],
};

const shop = (id, name, km) => ({
  shopId: id, userId: `u-${id}`, name, latitude: 26.9092, longitude: 75.1846,
  distanceKm: km, deliveryRadiusKm: 5, catalogItemCount: 13, mcpEnabled: true, ordersPaused: false,
});

function makeRepo({ shops = [], queryResults = [], widened = [] } = {}) {
  const calls = [];
  return {
    calls,
    userId,
    getProfile: async () => ({
      location_lat: 26.9091549, location_lng: 75.1845856, location_accuracy_m: 43,
      location_source: 'gps', location_captured_at: new Date(now - 60_000).toISOString(),
    }),
    // Mirrors the SQL function: a name filter and the radius limit are separate
    // questions, so the fake answers them separately too.
    findShopsNearby: async (fields) => {
      calls.push(fields);
      if (Number(fields.radiusKm) > 100) return widened;
      if (fields.query) return queryResults;
      return shops;
    },
  };
}

async function callFindShops(repo, args = {}) {
  const server = createServerFactory(config, { repo, now: () => now })({
    authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'scale-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const res = await client.callTool({ name: 'find_shops', arguments: args });
  await client.close();
  await server.close();
  return res;
}

// ── 1. SQL rows are used as-is, with the distance they carry ───────────────
{
  const repo = makeRepo({ shops: [shop('shop_one', 'Ramu General Store', 0.12), shop('shop_two', 'Second Shop', 0.9)] });
  const res = await callFindShops(repo, { limit: 2 });
  assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
  assert.strictEqual(res.structuredContent.shops.length, 2);
  // The tool exposes one decimal of a kilometre, as it always has.
  assert.strictEqual(res.structuredContent.shops[0].distance_km, 0.1);
  assert.strictEqual(repo.calls.length, 1, 'one SQL call, no registry download');
  assert.strictEqual(repo.calls[0].limit, 2);
  assert.ok(repo.calls[0].radiusKm >= 10, 'the query searches the widest radius a shop may have');
  assert.strictEqual(res.structuredContent.location.source, 'app_location');
  ok('find_shops answers from the SQL search with one call');
}

// ── 2. A name filter that matches nothing ──────────────────────────────────
{
  const repo = makeRepo({ shops: [shop('shop_one', 'Ramu General Store', 0.4)], queryResults: [] });
  const res = await callFindShops(repo, { query: 'Hardware' });
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'no_matching_shops');
  assert.strictEqual(repo.calls[0].query, 'Hardware', 'the name filter is applied inside SQL');
  ok('a name miss is reported as no_matching_shops, not out_of_range');
}

// ── 3. Nothing in radius: still say how far ────────────────────────────────
{
  const repo = makeRepo({ shops: [], widened: [shop('shop_far', 'Far Shop', 23.4)] });
  const res = await callFindShops(repo, {});
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'out_of_range');
  assert.strictEqual(res.structuredContent.details.nearest_km, 23.4);
  assert.match(res.content[0].text, /23\.4 km/);
  assert.ok(repo.calls.some((call) => Number(call.radiusKm) > 100), 'one widened probe finds the nearest shop');
  ok('an empty radius still reports the nearest shop distance');
}

console.log(`\nAll ${n} find-shops scale checks passed.`);
