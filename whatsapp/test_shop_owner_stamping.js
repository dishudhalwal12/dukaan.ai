import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolate the order store AND configure the single-shop fallback owner.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-bot-owner-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_DEFAULT_OWNER_ID = 'owner-42';

const { dukanOrders } = await import('./dukanOrders.js');
const { parseOpenRouterReply, activeShops } = await import('./dukanBot.js');
const { matchNearestShop } = await import('./dukanShops.js');

console.log('--- RUNNING BOT ORDER-OWNER STAMPING TESTS ---');
dukanOrders.clear();

const jid = '919999999999@s.whatsapp.net';
const withShop = (userId) => {
  activeShops.clear();
  activeShops.set(jid, { shopId: 'local', shopName: 'Dukaan Store', userId });
};

// ── Test 1: the local fallback carries the configured owner ───────────────────
// Ruling (T1): the local fallback applies ONLY when an explicit fallbackOwner is
// supplied (offline/dev). A live registry with no shops must reject instead.
console.log('\nTest 1: the local fallback carries the explicit fallback owner');
const fallback = matchNearestShop({ latitude: 26.9, longitude: 75.7 }, [], { fallbackOwner: 'owner-42' });
assert.strictEqual(fallback.matched, true, 'empty registry + fallbackOwner must match the local shop');
assert.strictEqual(fallback.isFallback, true, 'the local shop is flagged as a fallback');
assert.strictEqual(fallback.shop.userId, 'owner-42', 'fallback shop must carry the configured owner');
console.log('✓ Test 1 Passed: fallback shop is owned');

// ── Test 1b: a ranked shop is used only when it owns itself ───────────────────
console.log('\nTest 1b: ranked shop owner resolution');
const loc = { latitude: 26.9124, longitude: 75.7873 };
const rankedNoOwner = matchNearestShop(loc, [
  { shopId: 's1', shopName: 'S', latitude: 26.9124, longitude: 75.7873, catalogItemCount: 1 },
]);
assert.strictEqual(rankedNoOwner.matched, false, 'an ownerless shop is skipped, never default-filled');
assert.strictEqual(rankedNoOwner.reason, 'no-shops', 'skipping an ownerless shop leaves no shops');

const rankedOwned = matchNearestShop(loc, [
  { shopId: 's2', shopName: 'S', latitude: 26.9124, longitude: 75.7873, catalogItemCount: 1, userId: 'shop-owner-7' },
]);
assert.strictEqual(rankedOwned.matched, true, 'a located, owned shop is a real match');
assert.strictEqual(rankedOwned.shop.userId, 'shop-owner-7', 'a shop with its own owner keeps it');
console.log('✓ Test 1b Passed: registry owner is required, never invented');

// ── Test 2: a bot-created order is stamped with the matched shop's owner ───────
console.log('\nTest 2: CREATE_ORDER stamps the matched shop owner');
withShop('owner-42');
const jsonReply =
  '```json\n{"action":"CREATE_ORDER","items":[{"name":"Parle-G Biscuits","quantity":2}]}\n```';
const parsed = parseOpenRouterReply(jsonReply, jid, '919999999999', 'Cust', 'confirm', null);
assert.ok(parsed.newOrder, 'order should be created');
assert.strictEqual(parsed.newOrder.userId, 'owner-42', 'order must carry the shop owner');
assert.strictEqual(dukanOrders.getByOwner('owner-42').length, 1, 'owner sees the order');
assert.deepStrictEqual(dukanOrders.getByOwner('someone-else'), [], 'a different account sees nothing');
console.log('✓ Test 2 Passed: bot order is owned by the matched shop');

// ── Test 3: no matched shop → ownerless, visible to nobody ────────────────────
console.log('\nTest 3: unmatched shop → ownerless order');
activeShops.clear();
const parsed2 = parseOpenRouterReply(jsonReply, jid, '919999999999', 'Cust', 'confirm', null);
assert.ok(parsed2.newOrder, 'order should still be created');
assert.strictEqual(parsed2.newOrder.userId, null, 'no shop → null owner');
for (const who of ['owner-42', 'guest', 'local', 'anyone']) {
  assert.ok(
    !dukanOrders.getByOwner(who).some((o) => o.id === parsed2.newOrder.id),
    `ownerless order leaked to ${who}`
  );
}
console.log('✓ Test 3 Passed: ownerless order is invisible to every account');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log('🎉 ALL BOT ORDER-OWNER TESTS PASSED! 🎉');
console.log('========================================');
