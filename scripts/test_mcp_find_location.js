import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';

/**
 * `resolveLocation` used to answer `match_type: "house"` for any coordinates a
 * caller passed, and for any saved row, regardless of how the row was produced.
 * That label is what the quote and the assistant read as "verified rooftop".
 *
 * Rule: only a geocoded row may be described as house-level. A pin is street
 * level; a legacy row that claims house without geocode_verified is downgraded.
 */
console.log('--- RUNNING MCP FIND-LOCATION PRECISION TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 17, 0, 0);
const userId = '11111111-1111-4111-8111-111111111111';
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
  userId: '33333333-3333-4333-8333-333333333333',
  name: 'Ramu General Store',
  // Same neighbourhood as the pins below, so ranking succeeds and the
  // assertion is about precision, not serviceability.
  latitude: 26.9092,
  longitude: 75.1846,
  catalogItemCount: 13,
  deliveryRadiusKm: 5,
  mcpEnabled: true,
  ordersPaused: false,
};

function makeRepo({ addressRow = null } = {}) {
  return {
    userId,
    loadEnabledShops: async () => [shop],
    getShop: async () => shop,
    getCatalog: async () => [],
    getProfile: async () => null,
    getAddressRow: async (id) => (addressRow && id === addressRow.id ? addressRow : null),
    listAddresses: async () => [],
    saveAddress: async () => ({}),
    saveLocation: async () => ({}),
  };
}

async function callFindShops(repo, args) {
  const server = createServerFactory(config, { repo, now: () => now })({
    authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'find-location-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const res = await client.callTool({ name: 'find_shops', arguments: args });
  await client.close();
  await server.close();
  return res;
}

// ── 1. A pin shared in the chat is street level, not a rooftop ──────────────
{
  const res = await callFindShops(makeRepo(), { latitude: 26.9091549, longitude: 75.1845856 });
  assert.strictEqual(res.isError, undefined);
  const location = res.structuredContent.location;
  assert.strictEqual(location.match_type, 'street');
  assert.strictEqual(location.needs_exact_address, true, 'a pin cannot stand in for a typed address');
  assert.strictEqual(location.precision_source, 'chat_shared');
  ok('a shared pin is street level and still needs a typed address');
}

// ── 2. A geocoded row keeps house level ────────────────────────────────────
{
  const row = {
    id: addressId,
    line1: '29, infront of hospital',
    city: 'Sambhar',
    pincode: '303604',
    lat: 26.9091549,
    lng: 75.1845856,
    accuracy_m: 12,
    match_type: 'house',
    source: 'geocoded',
    precision_source: 'geocoded',
    geocode_verified: true,
  };
  const res = await callFindShops(makeRepo({ addressRow: row }), { address_id: addressId });
  assert.strictEqual(res.isError, undefined);
  const location = res.structuredContent.location;
  assert.strictEqual(location.match_type, 'house');
  assert.strictEqual(location.needs_exact_address, false);
  assert.strictEqual(location.precision_source, 'geocoded');
  ok('a verified geocoded address is the only thing that stays house level');
}

// ── 3. A legacy row claiming house without verification is downgraded ──────
{
  const row = {
    id: addressId,
    line1: '29, infront of hospital',
    city: 'Sambhar',
    pincode: '303604',
    lat: 26.9091549,
    lng: 75.1845856,
    accuracy_m: 43,
    match_type: 'house', // written by the old code from a GPS fix
    source: 'map_pin',
    precision_source: 'app_location',
    geocode_verified: false,
  };
  const res = await callFindShops(makeRepo({ addressRow: row }), { address_id: addressId });
  assert.strictEqual(res.isError, undefined);
  const location = res.structuredContent.location;
  assert.strictEqual(location.match_type, 'street', 'an unverified house label is downgraded');
  assert.strictEqual(location.needs_exact_address, true);
  ok('a row that claimed house without verification reads as street');
}

console.log(`\nAll ${n} find-location precision checks passed.`);
