import assert from 'assert';
import {
  distanceKm,
  normaliseShop,
  rankShops,
  serviceability,
  DEFAULT_MAX_DELIVERY_KM,
} from '../mcp/geometry.js';

console.log('--- RUNNING MCP GEOMETRY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const J = { latitude: 26.9124, longitude: 75.7873 };
const atKm = (km, extra = {}) => ({
  shopId: `r${km}`,
  userId: `u${km}`,
  shopName: `Shop ${km}`,
  latitude: J.latitude + km / 111.19,
  longitude: J.longitude,
  catalogItemCount: 1,
  deliveryRadiusKm: 5,
  ...extra,
});

assert.strictEqual(distanceKm(J, J), 0, 'same point is 0 km');
assert(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 111.19) < 1, '1 degree latitude is about 111 km');
assert(Number.isNaN(distanceKm(null, J)), 'missing point is NaN');
assert(Number.isNaN(distanceKm({ latitude: 91, longitude: 0 }, J)), 'out-of-range latitude is NaN');
ok('distanceKm is correct and rejects bad points');

const raw = normaliseShop({
  user_id: 'u1',
  store_name: 'Kirana',
  store_lat: '26.91',
  store_lng: '75.78',
  product_count: 12,
  public_shop_id: 'shop_abc123',
  delivery_radius_km: '4',
  mcp_enabled: true,
  orders_paused: false,
});
assert.deepStrictEqual(
  { userId: raw.userId, name: raw.name, lat: raw.latitude, lng: raw.longitude, count: raw.catalogItemCount, id: raw.shopId, radius: raw.deliveryRadiusKm },
  { userId: 'u1', name: 'Kirana', lat: 26.91, lng: 75.78, count: 12, id: 'shop_abc123', radius: 4 }
);
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: null, store_lng: 75.7 }), null, 'null latitude rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: 26.9, store_lng: '' }), null, 'empty longitude rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: NaN, store_lng: 75.7 }), null, 'NaN rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: 999, store_lng: 75.7 }), null, 'out-of-range rejected');
assert.strictEqual(normaliseShop({ store_lat: 26.9, store_lng: 75.7 }), null, 'missing owner rejected');
assert.strictEqual(normaliseShop(null), null, 'null row rejected');
ok('normaliseShop fails closed on malformed rows');

const nearestSmall = atKm(0.2, { shopId: 'near-small', catalogItemCount: 10 });
const nearBig = atKm(1, { shopId: 'near-big', catalogItemCount: 500 });
const farBig = atKm(4, { shopId: 'far-big', catalogItemCount: 9999 });
const ranked = rankShops([farBig, nearBig, nearestSmall], J);
assert.deepStrictEqual(ranked.map((s) => s.shopId), ['near-small', 'near-big', 'far-big']);
ok('rankShops orders by distance first');

const tieA = atKm(2, { shopId: 'zzz', catalogItemCount: 5 });
const tieB = atKm(2, { shopId: 'aaa', catalogItemCount: 5 });
assert.strictEqual(rankShops([tieA, tieB], J)[0].shopId, rankShops([tieB, tieA], J)[0].shopId, 'tie is deterministic');
const bigger = atKm(2, { shopId: 'bbb', catalogItemCount: 90 });
assert.strictEqual(rankShops([tieA, bigger], J)[0].shopId, 'bbb', 'equidistant bigger catalog wins');
ok('rankShops tie-breaks by catalog size, then id');

const paused = atKm(0.1, { shopId: 'paused', ordersPaused: true });
const disabled = atKm(0.1, { shopId: 'disabled', mcpEnabled: false });
const noRadius = atKm(0.3, { shopId: 'no-radius', deliveryRadiusKm: null });
assert.deepStrictEqual(
  rankShops([paused, disabled, noRadius, nearestSmall], J).map((s) => s.shopId),
  ['near-small', 'no-radius'],
  'paused and disabled shops are dropped; a missing radius falls back to default'
);
ok('rankShops drops shops that cannot accept AI orders');

const s1 = serviceability(atKm(4.9), J);
const s2 = serviceability(atKm(5.1), J);
const s3 = serviceability(atKm(5.1, { deliveryRadiusKm: 6 }), J);
assert.strictEqual(s1.ok, true);
assert.strictEqual(s2.ok, false);
assert.strictEqual(s2.reason, 'out_of_range');
assert.strictEqual(s3.ok, true);
assert.strictEqual(serviceability(atKm(1, { deliveryRadiusKm: 99 }), J).radiusKm, 10, 'radius is capped at 10 km');
assert.strictEqual(serviceability(null, J).reason, 'no_shop');
assert.strictEqual(serviceability(atKm(1), null).reason, 'no_location');
assert.strictEqual(DEFAULT_MAX_DELIVERY_KM, 5);
ok('serviceability fails closed and caps the radius');

console.log(`\nAll ${n} MCP geometry checks passed.`);
