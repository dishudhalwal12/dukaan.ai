import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServerFactory } from '../mcp/server.js';

/**
 * The production failure this file pins:
 *
 *   "29, infront of hospital, Sambhar 303604" was geocoded, the geocoder found
 *   nothing, and `save_address` answered `address_not_found` — even though the
 *   customer's app location was already on file. The assistant then worked
 *   around it by passing the GPS numbers with `source: "geocoded"`, and the row
 *   was stored as a verified house-level address.
 *
 * The rules enforced here (user decision, 2026-10-26):
 *   - a coordinate we already have beats a geocoder we do not need;
 *   - the typed text is stored exactly as typed;
 *   - precision is computed from evidence, never taken from the caller;
 *   - "address not found" is never the answer when a coordinate exists.
 */
console.log('--- RUNNING MCP ADDRESS-SOURCE TESTS ---');
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

/** A repo whose only job is to record what the tool passed down. */
function makeRepo({ profile = null, existing = null } = {}) {
  const calls = { saved: [] };
  return {
    calls,
    userId,
    getProfile: async () => profile,
    saveProfile: async ({ fullName, phone }) => ({ full_name: fullName, phone }),
    listAddresses: async () => [],
    getAddressRow: async (id) => (existing && id === existing.id ? existing : null),
    saveAddress: async (fields) => {
      calls.saved.push(fields);
      return {
        address_id: fields.address_id || addressId,
        label: fields.label || null,
        address: [fields.line1, fields.city, fields.pincode].filter(Boolean).join(', '),
        line1: fields.line1,
        line2: null,
        landmark: null,
        city: fields.city || null,
        state: null,
        pincode: fields.pincode || null,
        match_type: fields.match_type,
        source: fields.source,
        accuracy_m: fields.accuracy_m,
        precision_source: fields.precision_source,
        geocode_verified: fields.geocode_verified,
        is_default: Boolean(fields.is_default),
        maps_url: `https://maps.google.com/?q=${fields.lat},${fields.lng}`,
      };
    },
    deleteAddress: async () => ({ deleted: true }),
  };
}

async function connect(repo, { fetchImpl } = {}) {
  const server = createServerFactory(config, {
    repo,
    now: () => now,
    fetchImpl: fetchImpl || (async () => {
      throw new Error('the geocoder must not be called on the happy path');
    }),
  })({ authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'address-source-test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

const appLocation = {
  location_lat: 26.9091549,
  location_lng: 75.1845856,
  location_accuracy_m: 43,
  location_source: 'gps',
  location_captured_at: new Date(now - 30 * 60_000).toISOString(),
};

// ── 1. Explicit coordinates: chat_shared, never "house" ─────────────────────
{
  const repo = makeRepo();
  const { client, server } = await connect(repo);
  const res = await client.callTool({
    name: 'save_address',
    arguments: {
      label: 'Home',
      line1: '29, infront of hospital',
      city: 'Sambhar',
      pincode: '303604',
      latitude: 26.9091549,
      longitude: 75.1845856,
      accuracy_m: 43,
    },
  });
  assert.strictEqual(res.isError, undefined, 'an explicit pin must save');
  const saved = repo.calls.saved[0];
  assert.strictEqual(saved.precision_source, 'chat_shared');
  assert.strictEqual(saved.geocode_verified, false);
  assert.strictEqual(saved.match_type, 'street', 'a shared pin is not a rooftop');
  assert.strictEqual(saved.source, 'map_pin');
  assert.strictEqual(saved.line1, '29, infront of hospital', 'the typed line is stored verbatim');
  assert.strictEqual(saved.city, 'Sambhar', 'the city is not rewritten to whatever the geocoder prefers');
  assert.strictEqual(res.structuredContent.address.geocode_verified, false);
  await client.close();
  await server.close();
  ok('an explicit pin saves as chat_shared and never claims house level');
}

// ── 2. No coordinates, but the app location: save without a geocoder ────────
{
  const repo = makeRepo({ profile: { full_name: 'Raj Sharma', phone: '+917678798767', ...appLocation } });
  let geocodeCalls = 0;
  const { client, server } = await connect(repo, {
    fetchImpl: async () => {
      geocodeCalls++;
      throw new Error('offline');
    },
  });
  const res = await client.callTool({
    name: 'save_address',
    arguments: { label: 'Home', line1: '29, infront of hospital', city: 'Sambhar', pincode: '303604' },
  });
  assert.strictEqual(res.isError, undefined, 'the app location is enough to save an address');
  assert.strictEqual(geocodeCalls, 0, 'no geocoder request when a coordinate is already known');
  const saved = repo.calls.saved[0];
  assert.strictEqual(saved.precision_source, 'app_location');
  assert.strictEqual(saved.geocode_verified, false);
  assert.strictEqual(saved.match_type, 'street');
  assert.strictEqual(Number(saved.lat), appLocation.location_lat);
  assert.strictEqual(Number(saved.lng), appLocation.location_lng);
  assert.strictEqual(saved.accuracy_m, 43);
  assert.strictEqual(saved.line1, '29, infront of hospital');
  await client.close();
  await server.close();
  ok('a typed address saves from the app location with zero geocoder traffic');
}

// ── 3. A caller cannot promote its own precision ───────────────────────────
{
  const repo = makeRepo({ profile: appLocation });
  const { client, server } = await connect(repo);
  const res = await client.callTool({
    name: 'save_address',
    arguments: {
      label: 'Home',
      line1: '29, infront of hospital',
      pincode: '303604',
      latitude: 26.9091549,
      longitude: 75.1845856,
      source: 'geocoded',
    },
  });
  assert.strictEqual(res.isError, undefined);
  const saved = repo.calls.saved[0];
  assert.strictEqual(saved.source, 'map_pin', 'a caller claim of geocoding is downgraded');
  assert.strictEqual(saved.geocode_verified, false);
  assert.strictEqual(saved.match_type, 'street');
  assert.strictEqual(res.structuredContent.address.match_type, 'street');
  await client.close();
  await server.close();
  ok('source:"geocoded" from the model is ignored unless we geocoded');
}

// ── 4. No coordinate anywhere: ask for a pin, never "address not found" ────
{
  const repo = makeRepo({ profile: { full_name: 'Raj', phone: null } });
  const { client, server } = await connect(repo, {
    fetchImpl: async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const res = await client.callTool({
    name: 'save_address',
    arguments: { label: 'Home', line1: '29, infront of hospital', city: 'Sambhar', pincode: '303604' },
  });
  assert.strictEqual(res.isError, true);
  assert.strictEqual(res.structuredContent.code, 'location_required', 'the honest code, not address_not_found');
  assert.match(res.content[0].text, /map pin|location/i);
  assert.strictEqual(repo.calls.saved.length, 0, 'nothing is written without a coordinate');
  await client.close();
  await server.close();
  ok('with no coordinate at all the answer is location_required, not address_not_found');
}

// ── 5. Editing an address with the same text keeps its provenance ──────────
{
  const existing = {
    id: addressId,
    line1: '29, infront of hospital',
    line2: '',
    landmark: '',
    city: 'Sambhar',
    state: '',
    pincode: '303604',
    lat: 26.9091549,
    lng: 75.1845856,
    accuracy_m: 43,
    match_type: 'street',
    source: 'map_pin',
    precision_source: 'chat_shared',
    geocode_verified: false,
    coords_captured_at: new Date(now - 3600_000).toISOString(),
    is_default: true,
  };
  const repo = makeRepo({ profile: appLocation, existing });
  const { client, server } = await connect(repo);
  const res = await client.callTool({
    name: 'save_address',
    arguments: { address_id: addressId, label: 'Home' },
  });
  assert.strictEqual(res.isError, undefined);
  const saved = repo.calls.saved[0];
  assert.strictEqual(saved.precision_source, 'chat_shared', 'an edit keeps how the fix was obtained');
  assert.strictEqual(saved.geocode_verified, false);
  assert.strictEqual(Number(saved.lat), existing.lat);
  await client.close();
  await server.close();
  ok('editing a label does not launder a pin into a verified address');
}

console.log(`\nAll ${n} address-source checks passed.`);
