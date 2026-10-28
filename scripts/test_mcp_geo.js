import assert from 'assert';
import {
  buildAddressQuery,
  formatAddress,
  matchTypeFromNominatim,
  matchTypeFromGoogle,
  geocodeAddress,
  mapsUrl,
  needsExactAddress,
} from '../mcp/geo.js';

console.log('--- RUNNING MCP GEOCODING TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

assert.strictEqual(
  buildAddressQuery({ line1: '12, MG Road', landmark: 'Near City Mall', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' }),
  '12, MG Road, Near City Mall, Jaipur, Rajasthan, 302001, India'
);
assert.strictEqual(buildAddressQuery({ pincode: '302001' }), '302001, India');
assert.strictEqual(formatAddress({ line1: '12, MG Road', city: 'Jaipur', pincode: '302001' }), '12, MG Road, Jaipur, 302001');
assert.strictEqual(mapsUrl(26.9124, 75.7873), 'https://maps.google.com/?q=26.9124,75.7873');
ok('address text and maps links are built consistently');

assert.strictEqual(matchTypeFromNominatim({ addresstype: 'house' }).matchType, 'house');
assert.strictEqual(matchTypeFromNominatim({ type: 'road' }).matchType, 'street');
assert.strictEqual(matchTypeFromNominatim({ addresstype: 'suburb' }).matchType, 'area');
assert.strictEqual(matchTypeFromNominatim({ addresstype: 'postcode' }).matchType, 'area');
assert.strictEqual(matchTypeFromNominatim({ addresstype: 'city' }).matchType, 'city');
assert.strictEqual(matchTypeFromNominatim({ addresstype: 'unknown' }).matchType, 'area');
assert.strictEqual(matchTypeFromGoogle('ROOFTOP').matchType, 'house');
assert.strictEqual(matchTypeFromGoogle('RANGE_INTERPOLATED').matchType, 'street');
assert.strictEqual(matchTypeFromGoogle('GEOMETRIC_CENTER').matchType, 'area');
assert.strictEqual(matchTypeFromGoogle('APPROXIMATE').matchType, 'city');
assert.strictEqual(needsExactAddress('city'), true);
assert.strictEqual(needsExactAddress('area'), false);
assert.strictEqual(needsExactAddress('street'), false);
ok('provider location types map to house/street/area/city');

const nominatimBody = [
  {
    lat: '26.9124',
    lon: '75.7873',
    display_name: '12, MG Road, Jaipur, Rajasthan, 302001, India',
    type: 'house',
    addresstype: 'house',
    address: { house_number: '12', road: 'MG Road', city: 'Jaipur', postcode: '302001' },
  },
];
let calls = 0;
const fetchImpl = async (url, init) => {
  calls++;
  assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
  assert.match(String(url), /countrycodes=in/);
  assert.match(init.headers['User-Agent'], /Nukkad/);
  return new Response(JSON.stringify(nominatimBody), { status: 200 });
};
const cache = new Map();
const first = await geocodeAddress(
  { line1: '12, MG Road', city: 'Jaipur', pincode: '302001' },
  { fetchImpl, provider: 'nominatim', cache, now: () => 1000, minIntervalMs: 0 }
);
assert.strictEqual(first.ok, true);
assert.strictEqual(first.lat, 26.9124);
assert.strictEqual(first.lng, 75.7873);
assert.strictEqual(first.matchType, 'house');
assert.strictEqual(first.accuracyM, 25);
assert.strictEqual(first.provider, 'nominatim');
assert.match(first.displayName, /MG Road/);
assert.strictEqual(calls, 1);

const second = await geocodeAddress(
  { line1: '12, MG Road', city: 'Jaipur', pincode: '302001' },
  { fetchImpl, provider: 'nominatim', cache, now: () => 2000, minIntervalMs: 0 }
);
assert.strictEqual(second.ok, true);
assert.strictEqual(calls, 1, 'the same address is served from cache');
ok('Nominatim geocoding maps coordinates and caches by address');

const none = await geocodeAddress(
  { line1: 'Nowhere' },
  { fetchImpl: async () => new Response('[]', { status: 200 }), provider: 'nominatim', cache: new Map(), minIntervalMs: 0 }
);
assert.strictEqual(none.ok, false);
assert.strictEqual(none.code, 'address_not_found');
ok('an empty geocoder response is a clean failure');

const down = await geocodeAddress(
  { line1: '12 MG Road' },
  { fetchImpl: async () => { throw new Error('network'); }, provider: 'nominatim', cache: new Map(), minIntervalMs: 0 }
);
assert.strictEqual(down.ok, false);
assert.strictEqual(down.code, 'geocoder_unavailable');
ok('a network failure is reported, never guessed');

const google = await geocodeAddress(
  { line1: '12 MG Road', city: 'Jaipur' },
  {
    provider: 'google',
    googleKey: 'test-key',
    cache: new Map(),
    fetchImpl: async (url) => {
      assert.match(String(url), /maps\.googleapis\.com\/maps\/api\/geocode\/json/);
      return new Response(JSON.stringify({
        status: 'OK',
        results: [{ formatted_address: '12 MG Road, Jaipur', geometry: { location: { lat: 26.91, lng: 75.78 }, location_type: 'ROOFTOP' } }],
      }), { status: 200 });
    },
  }
);
assert.strictEqual(google.ok, true);
assert.strictEqual(google.matchType, 'house');
assert.strictEqual(google.provider, 'google');
ok('the Google provider is a seam, not a rewrite');

let googleAttempts = 0;
const fallback = await geocodeAddress(
  { line1: '12 MG Road', city: 'Jaipur' },
  {
    provider: 'google',
    googleKey: 'bad-key',
    cache: new Map(),
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      googleAttempts++;
      if (String(url).includes('googleapis')) throw new Error('Google key rejected');
      return new Response(JSON.stringify([
        { lat: '26.91', lon: '75.78', display_name: '12 MG Road, Jaipur', type: 'house', addresstype: 'house' },
      ]), { status: 200 });
    },
  }
);
assert.strictEqual(fallback.ok, true);
assert.strictEqual(fallback.provider, 'nominatim');
assert.strictEqual(googleAttempts, 2);
ok('a broken Google key falls back to Nominatim instead of blocking addresses');

console.log(`\nAll ${n} MCP geocoding checks passed.`);
