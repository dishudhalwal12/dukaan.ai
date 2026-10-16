import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Point the order store at a throwaway file BEFORE importing the module, so this
// run can never rewrite the live whatsapp/store/orders.json.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-orders-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');

const { dukanOrders, selectOrders } = await import('./dukanOrders.js');

console.log('--- RUNNING ORDER OWNERSHIP (MULTI-TENANT) TESTS ---');

// Every test starts from an empty throwaway store.
dukanOrders.clear();

const make = (userId, total) =>
  dukanOrders.createOrder({
    customerName: 'C',
    customerPhone: '919999999999',
    items: [{ name: 'X', price: total, quantity: 1 }],
    totalAmount: total,
    ...(userId === undefined ? {} : { userId }),
  });

// ── Test 1: createOrder stamps the owner ──────────────────────────────────────
console.log('\nTest 1: createOrder stamps the owning account');
const a1 = make('user-A', 10);
const b1 = make('user-B', 20);
const orphan = make(undefined, 5);

assert.strictEqual(a1.userId, 'user-A', 'A order must carry user-A');
assert.strictEqual(b1.userId, 'user-B', 'B order must carry user-B');
assert.strictEqual(orphan.userId, null, 'ownerless order must be stored as null, not undefined');
console.log('✓ Test 1 Passed: each order records its owner (or null)');

// ── Test 2: getByOwner returns ONLY that owner ────────────────────────────────
console.log('\nTest 2: getByOwner isolates accounts');
const aOrders = dukanOrders.getByOwner('user-A');
assert.deepStrictEqual(aOrders.map((o) => o.id), [a1.id], 'A must see exactly its own order');
assert.ok(
  !aOrders.some((o) => o.id === b1.id || o.id === orphan.id),
  'A must never see B or an ownerless order'
);
console.log('✓ Test 2 Passed: A sees only A');

// ── Test 3: unknown owner is empty; falsy owner never leaks ───────────────────
console.log('\nTest 3: unknown/falsy owner returns nothing');
assert.deepStrictEqual(dukanOrders.getByOwner('nobody'), [], 'unknown owner sees nothing');
assert.deepStrictEqual(dukanOrders.getByOwner(''), [], 'empty owner sees nothing');
assert.deepStrictEqual(dukanOrders.getByOwner(undefined), [], 'undefined owner sees nothing');
assert.deepStrictEqual(dukanOrders.getByOwner(null), [], 'null owner sees nothing');
console.log('✓ Test 3 Passed: no owner, no data');

// ── Test 4: ownerless rows are never served to anyone ─────────────────────────
console.log('\nTest 4: legacy ownerless rows stay hidden from every account');
for (const owner of ['user-A', 'user-B', 'guest', 'local']) {
  const rows = dukanOrders.getByOwner(owner);
  assert.ok(
    rows.every((o) => o.userId === owner),
    `getByOwner("${owner}") leaked an order that is not owned by that account`
  );
  assert.ok(
    rows.every((o) => o.id !== orphan.id),
    `getByOwner("${owner}") leaked the ownerless order`
  );
}
console.log('✓ Test 4 Passed: ownerless rows are invisible');

// ── Test 5 (STRESS): many owners, no cross-talk, no loss ──────────────────────
console.log('\nTest 5 (stress): 200 orders across 5 owners + 25 ownerless');
dukanOrders.clear();
const owners = ['store-1', 'store-2', 'store-3', 'store-4', 'store-5'];
const owned = new Map(owners.map((o) => [o, []]));
const orphanIds = new Set();
let totalOwned = 0;

for (let i = 0; i < 200; i++) {
  const owner = owners[i % owners.length];
  const rec = make(owner, 10 + i);
  owned.get(owner).push(rec.id);
  totalOwned++;
}
for (let i = 0; i < 25; i++) {
  orphanIds.add(make(undefined, i).id);
}

let seenAcrossOwners = 0;
for (const owner of owners) {
  const rows = dukanOrders.getByOwner(owner);
  seenAcrossOwners += rows.length;
  assert.strictEqual(
    rows.length,
    owned.get(owner).length,
    `${owner} must see exactly its ${owned.get(owner).length} orders`
  );
  const expected = new Set(owned.get(owner));
  for (const r of rows) {
    assert.ok(expected.has(r.id), `${owner} saw a foreign/unowned order: ${r.id}`);
    assert.strictEqual(r.userId, owner, `${owner} saw an order owned by ${r.userId}`);
    assert.ok(!orphanIds.has(r.id), `${owner} saw an ownerless order`);
  }
}
assert.strictEqual(seenAcrossOwners, totalOwned, 'every owned order appears for exactly its owner (no loss)');
console.log(`✓ Test 5 Passed: 5 owners x 40 = ${seenAcrossOwners} owned orders isolated; 25 ownerless hidden`);

// ── Test 6: operator getAll() still exposes everything (raw path) ─────────────
console.log('\nTest 6: operator getAll() sees the raw set (opt-in path)');
const raw = dukanOrders.getAll();
assert.strictEqual(raw.length, 225, `operator view must see all 225 rows, saw ${raw.length}`);
assert.ok(raw.some((o) => orphanIds.has(o.id)), 'operator view includes ownerless rows');
console.log('✓ Test 6 Passed: operator view intact, merchant view scoped');

// ── Test 7: route selector — operator opt-in vs merchant scoping ──────────────
console.log('\nTest 7: selectOrders() decides what a request is served');
assert.strictEqual(
  selectOrders({ scope: 'all' }).length,
  225,
  'scope=all is the operator view and sees every row'
);
assert.strictEqual(
  selectOrders({ userId: 'store-1' }).length,
  40,
  'a named account sees only its own orders'
);
assert.deepStrictEqual(selectOrders({}), [], 'an anonymous request sees nothing');
assert.deepStrictEqual(selectOrders({ userId: '' }), [], 'a blank account sees nothing');
assert.ok(
  selectOrders({ scope: 'all', userId: 'store-1' }).every(() => true) &&
    selectOrders({ scope: 'all' }).length > selectOrders({ userId: 'store-1' }).length,
  'operator scope is strictly wider than a single account'
);
console.log('✓ Test 7 Passed: anonymous → 0, account → its own, operator → all');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log('🎉 ALL ORDER OWNERSHIP TESTS PASSED! 🎉');
console.log('========================================');
