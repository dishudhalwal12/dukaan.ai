import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import {
  distanceKm,
  normaliseShop,
  rankShops,
  matchNearestShop,
  maxDeliveryKm,
  loadShops,
} from './dukanShops.js';

console.log('--- RUNNING SHOP MATCHING TESTS (T1) ---');

const J = { latitude: 26.9124, longitude: 75.7873 };
const atKm = (km) => ({ shopId: `r${km}`, userId: `u${km}`, latitude: J.latitude + km / 111.19, longitude: J.longitude });
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ── distance maths ────────────────────────────────────────────────────────────
assert.strictEqual(distanceKm(J, J), 0, 'same point is 0 km');
assert(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 111.19) < 1, '1 deg latitude ≈ 111 km');
ok('distanceKm is correct');

// ── normaliseShop hygiene ─────────────────────────────────────────────────────
const good = normaliseShop({ user_id: 'u1', store_name: 'Kirana', store_lat: 26.9, store_lng: 75.7, product_count: 12 });
assert.strictEqual(good.userId, 'u1');
assert.strictEqual(good.shopName, 'Kirana');
assert.strictEqual(good.catalogItemCount, 12);
ok('normaliseShop maps a raw Supabase-shaped row');

assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: null, store_lng: null }), null, 'null coords rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: '', store_lng: '' }), null, 'empty-string coords rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: NaN, store_lng: 75.7 }), null, 'NaN coords rejected');
assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: 999, store_lng: 75.7 }), null, 'out-of-range latitude rejected');
assert.strictEqual(normaliseShop({ store_lat: 26.9, store_lng: 75.7 }), null, 'missing userId rejected');
assert.strictEqual(normaliseShop(null), null, 'null row rejected');
ok('normaliseShop rejects every malformed row (no (0,0) trap)');

assert.strictEqual(normaliseShop({ user_id: 'u1', store_lat: '26.91', store_lng: '75.78' }).latitude, 26.91, 'string coords coerced');
ok('normaliseShop coerces numeric strings');

// ── ranking ───────────────────────────────────────────────────────────────────
const nearSmall = { shopId: 'near-small', userId: 'a', shopName: 'A', latitude: J.latitude, longitude: J.longitude, catalogItemCount: 10 };
const nearBig = { shopId: 'near-big', userId: 'b', shopName: 'B', latitude: J.latitude + 0.02, longitude: J.longitude, catalogItemCount: 500 };
const farBig = { shopId: 'far-big', userId: 'c', shopName: 'C', latitude: 26.99, longitude: 75.79, catalogItemCount: 9999 };

const ranked = rankShops([farBig, nearSmall, nearBig], J);
assert.strictEqual(ranked[0].shopId, 'near-small', 'nearest wins over bigger-but-farther');
assert.strictEqual(ranked[1].shopId, 'near-big', 'then the next nearest');
ok('rankShops orders by proximity first');

const tieA = { shopId: 'zzz', userId: 'z', latitude: 26.95, longitude: 75.8, catalogItemCount: 5 };
const tieB = { shopId: 'aaa', userId: 'y', latitude: 26.95, longitude: 75.8, catalogItemCount: 5 };
assert.strictEqual(rankShops([tieA, tieB], J)[0].shopId, rankShops([tieB, tieA], J)[0].shopId, 'stable tie-break by shopId');
ok('full tie is deterministic regardless of input order');

const b1 = { shopId: 'b1', userId: '1', latitude: 26.95, longitude: 75.8, catalogItemCount: 3 };
const b2 = { shopId: 'b2', userId: '2', latitude: 26.95, longitude: 75.8, catalogItemCount: 90 };
assert.strictEqual(rankShops([b1, b2], J)[0].shopId, 'b2', 'equidistant → bigger catalog wins');
ok('equidistant tie-break uses catalog size');

// ── matchNearestShop ──────────────────────────────────────────────────────────
let r = matchNearestShop(J, [nearSmall, farBig]);
assert.strictEqual(r.matched, true);
assert.strictEqual(r.shop.shopId, 'near-small');
assert(Number.isFinite(r.distanceKm));
ok('matchNearestShop matches the nearest shop in range');

r = matchNearestShop(J, []);
assert.strictEqual(r.matched, false);
assert.strictEqual(r.reason, 'no-shops');
ok('empty registry rejects (no silent local fallback)');

r = matchNearestShop(J, [farBig]);
assert.strictEqual(r.matched, false);
assert.strictEqual(r.reason, 'out-of-range');
ok('all shops beyond the radius reject');

r = matchNearestShop(null, [nearSmall]);
assert.strictEqual(r.matched, false);
assert.strictEqual(r.reason, 'no-location');
ok('missing location rejects');

r = matchNearestShop(J, [{ shopId: 'lone', userId: null, latitude: J.latitude, longitude: J.longitude, catalogItemCount: 5 }]);
assert.strictEqual(r.matched, false, 'an ownerless shop must never be matched');
ok('ownerless shop is skipped (would create an invisible order)');

assert.strictEqual(matchNearestShop(J, [atKm(4.9)]).matched, true, '4.9 km accepted');
assert.strictEqual(matchNearestShop(J, [atKm(5.1)]).matched, false, '5.1 km rejected');
ok('5 km radius boundary is respected');

r = matchNearestShop(J, [], { fallbackOwner: 'owner-42' });
assert.strictEqual(r.matched, true);
assert.strictEqual(r.isFallback, true);
assert.strictEqual(r.shop.userId, 'owner-42');
ok('local fallback applies only when a fallbackOwner is supplied');

// ── maxDeliveryKm config ──────────────────────────────────────────────────────
const prev = process.env.DUKAN_MAX_DELIVERY_KM;
assert.strictEqual(maxDeliveryKm(), 5, 'default radius is 5 km');
process.env.DUKAN_MAX_DELIVERY_KM = '3';
assert.strictEqual(maxDeliveryKm(), 3, 'env overrides the radius');
process.env.DUKAN_MAX_DELIVERY_KM = 'abc';
assert.strictEqual(maxDeliveryKm(), 5, 'a bad value falls back to 5');
process.env.DUKAN_MAX_DELIVERY_KM = '-2';
assert.strictEqual(maxDeliveryKm(), 5, 'a negative value falls back to 5');
if (prev === undefined) delete process.env.DUKAN_MAX_DELIVERY_KM; else process.env.DUKAN_MAX_DELIVERY_KM = prev;
ok('maxDeliveryKm reads env and guards bad values');

// ── loadShops: injectable, null on failure ────────────────────────────────────
const rows = await loadShops(async () => [
  { user_id: 'u1', store_name: 'Kirana', store_lat: 26.9, store_lng: 75.7, product_count: 4 },
  { user_id: 'u2', store_name: 'Broken', store_lat: null, store_lng: null },
]);
assert.strictEqual(rows.length, 1, 'malformed rows are dropped, not matched');
assert.strictEqual(rows[0].userId, 'u1');
ok('loadShops maps and filters provider rows');

assert.strictEqual(await loadShops(async () => { throw new Error('network down'); }), null, 'a throwing provider yields null (registry unreachable)');
ok('loadShops signals registry failure with null');

console.log('\n========================================');
console.log(`🎉 ALL ${n} SHOP MATCHING TESTS PASSED 🎉`);
console.log('========================================');
