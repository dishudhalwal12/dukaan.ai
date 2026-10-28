import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolate the order store AND configure the single-shop fallback owner.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-bot-owner-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(tmpDir, 'catalog.json');
process.env.DUKAN_DEFAULT_OWNER_ID = 'owner-42';

const { dukanOrders } = await import('./dukanOrders.js');
const { parseOpenRouterReply, activeShops } = await import('./dukanBot.js');
const { matchNearestShop } = await import('./dukanShops.js');

console.log('--- RUNNING BOT ORDER-OWNER STAMPING TESTS ---');
dukanOrders.clear();

const jid = '919999999999@s.whatsapp.net';
const withShop = (userId) => {
  activeShops.clear();
  activeShops.set(jid, {
    shopId: 'local',
    shopName: 'Nukkad Store',
    userId,
    catalog: [{ id: 'p1', name: 'Parle-G Biscuits', category: 'Biscuits', price: 10, unit: 'pack', inStock: true, keywords: ['parle-g', 'biscuit'] }],
  });
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

// ── Test 3: no matched shop → NO order is created (fail closed) ───────────────
// Ruling (T6): an order with no owner is visible to nobody on a shared backend,
// so it is never created — the bot refuses instead of writing an invisible row.
console.log('\nTest 3: no matched shop → no order is created');
const ownedBefore = dukanOrders.getByOwner('owner-42').length;
activeShops.clear();
const parsed2 = parseOpenRouterReply(jsonReply, jid, '919999999999', 'Cust', 'confirm', null);
assert.strictEqual(parsed2.newOrder, null, 'an order with no owner must never be created');
assert.strictEqual(dukanOrders.getByOwner('owner-42').length, ownedBefore, 'no order is stamped for a previous owner');
assert.strictEqual(dukanOrders.getByOwner('guest').length, 0, 'nothing leaks to a random account');
assert.strictEqual(dukanOrders.getByOwner('local').length, 0, 'nothing leaks to the local shop id');
console.log('✓ Test 3 Passed: an unroutable order is refused, never created ownerless');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log('🎉 ALL BOT ORDER-OWNER TESTS PASSED! 🎉');
console.log('========================================');
