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

// ── Test 1: fallback shop carries the configured owner ────────────────────────
console.log('\nTest 1: matchNearestShop fallback carries DUKAN_DEFAULT_OWNER_ID');
const fallback = matchNearestShop({ latitude: 26.9, longitude: 75.7 });
assert.strictEqual(fallback.isFallback, true, 'empty registry must fall back to local shop');
assert.strictEqual(fallback.userId, 'owner-42', 'fallback shop must carry the configured owner');
console.log('✓ Test 1 Passed: fallback shop is owned');

// ── Test 1b: a ranked shop without its own owner falls back to the default ────
console.log('\nTest 1b: ranked shop owner resolution');
const loc = { latitude: 26.9124, longitude: 75.7873 };
const rankedNoOwner = matchNearestShop(loc, [
  { shopId: 's1', shopName: 'S', latitude: 26.9124, longitude: 75.7873, catalogItemCount: 1 },
]);
assert.strictEqual(rankedNoOwner.isFallback, false, 'a located shop is a real match');
assert.strictEqual(rankedNoOwner.userId, 'owner-42', 'ownerless ranked shop falls back to the default owner');

const rankedOwned = matchNearestShop(loc, [
  { shopId: 's2', shopName: 'S', latitude: 26.9124, longitude: 75.7873, catalogItemCount: 1, userId: 'shop-owner-7' },
]);
assert.strictEqual(rankedOwned.userId, 'shop-owner-7', 'a shop with its own owner keeps it, ignoring the default');
console.log('✓ Test 1b Passed: registry owner wins, default fills the gap');

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
