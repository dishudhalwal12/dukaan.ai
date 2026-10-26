import assert from 'assert';
import {
  LOCATION_MAX_AGE_DAYS,
  describeAge,
  precisionForLocation,
  storedLocationFromProfile,
} from '../mcp/location.js';

/**
 * The position captured at MCP sign-in is the difference between "which shop
 * delivers to me?" and "send me your pincode" on the very first message. These
 * checks pin the rules that decide when it may be used.
 */
console.log('--- RUNNING MCP SAVED-LOCATION TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const now = Date.UTC(2026, 9, 26, 10, 0, 0);
const daysAgo = (days) => new Date(now - days * 86_400_000).toISOString();

const profile = (overrides = {}) => ({
  user_id: 'u1',
  full_name: 'Asha',
  phone: '+919876543210',
  location_lat: 26.9124,
  location_lng: 75.7873,
  location_accuracy_m: 18,
  location_source: 'gps',
  location_label: null,
  location_captured_at: daysAgo(2),
  ...overrides,
});

const fresh = storedLocationFromProfile(profile(), now);
assert.strictEqual(fresh.ok, true);
assert.strictEqual(fresh.lat, 26.9124);
assert.strictEqual(fresh.lng, 75.7873);
assert.strictEqual(fresh.ageDays, 2);
assert.strictEqual(fresh.precision, 'street');
assert.strictEqual(fresh.needsExactAddress, true, 'a raw fix is never a delivery address');
ok('a two-day-old GPS fix is usable and never counts as an address');

assert.strictEqual(LOCATION_MAX_AGE_DAYS, 30);
assert.strictEqual(storedLocationFromProfile(profile({ location_captured_at: daysAgo(29) }), now).ok, true);
assert.strictEqual(storedLocationFromProfile(profile({ location_captured_at: daysAgo(31) }), now).ok, false);
const stale = storedLocationFromProfile(profile({ location_captured_at: daysAgo(31) }), now);
assert.strictEqual(stale.code, 'location_stale');
assert.strictEqual(stale.ageDays, 31);
ok('the 30-day rule accepts day 29 and refuses day 31');

assert.strictEqual(storedLocationFromProfile(null, now).code, 'location_missing');
assert.strictEqual(storedLocationFromProfile({}, now).code, 'location_missing');
assert.strictEqual(storedLocationFromProfile(profile({ location_lat: null }), now).code, 'location_missing');
assert.strictEqual(storedLocationFromProfile(profile({ location_lng: undefined }), now).code, 'location_missing');
assert.strictEqual(storedLocationFromProfile(profile({ location_captured_at: null }), now).code, 'location_missing');
ok('half a position, no position, and no timestamp are all "missing"');

// An IP guess can still find a city, but it must be labelled as one.
const coarse = storedLocationFromProfile(profile({ location_source: 'ip_approximate', location_accuracy_m: 10000 }), now);
assert.strictEqual(coarse.ok, true);
assert.strictEqual(coarse.precision, 'city');
assert.strictEqual(precisionForLocation({ source: 'gps', accuracyM: 5000 }), 'city');
assert.strictEqual(precisionForLocation({ source: 'gps', accuracyM: 900 }), 'area');
assert.strictEqual(precisionForLocation({ source: 'chat_shared', accuracyM: 20 }), 'street');
assert.strictEqual(precisionForLocation({ source: 'gps', accuracyM: null }), 'street');
ok('precision reflects the source and accuracy, not wishful thinking');

assert.strictEqual(describeAge(0.2), 'from today');
assert.strictEqual(describeAge(1), 'about a day old');
assert.strictEqual(describeAge(2), '2 days old');
assert.strictEqual(describeAge(undefined), 'unknown age');
ok('age wording is stable for the tool replies');

console.log(`\nAll ${n} saved-location checks passed.`);
