import assert from 'assert';
import { orderBelongsTo, ownedOrdersOnly } from '../src/utils/orderOwnership.ts';

console.log('--- RUNNING CLIENT ORDER-OWNERSHIP TESTS ---');

// ── Test 1: orderBelongsTo only accepts an exact, non-empty owner match ───────
console.log('\nTest 1: orderBelongsTo');
assert.strictEqual(orderBelongsTo({ userId: 'me' }, 'me'), true, 'own order belongs');
assert.strictEqual(orderBelongsTo({ userId: 'me' }, 'you'), false, 'foreign order does not belong');
assert.strictEqual(orderBelongsTo({ userId: 'me' }, ''), false, 'no session id → nothing belongs');
assert.strictEqual(orderBelongsTo({ userId: 'me' }, undefined), false, 'undefined session id → nothing belongs');
assert.strictEqual(orderBelongsTo({ userId: 'me' }, null), false, 'null session id → nothing belongs');
assert.strictEqual(orderBelongsTo({}, 'me'), false, 'unowned order never belongs');
assert.strictEqual(orderBelongsTo({ userId: null }, 'me'), false, 'null-owner order never belongs');
assert.strictEqual(orderBelongsTo({ userId: undefined }, 'me'), false, 'undefined-owner order never belongs');
console.log('✓ Test 1 Passed: exact non-empty match required');

// ── Test 2: ownedOrdersOnly keeps only mine, drops foreign + unowned ──────────
console.log('\nTest 2: ownedOrdersOnly');
const mixed = [
  { id: '1', userId: 'me' },
  { id: '2', userId: 'other' },
  { id: '3' },
  { id: '4', userId: 'me' },
  { id: '5', userId: null },
];
const mine = ownedOrdersOnly(mixed, 'me');
assert.deepStrictEqual(mine.map((o) => o.id), ['1', '4'], 'keeps only mine, in order');
assert.deepStrictEqual(ownedOrdersOnly(mixed, 'ghost'), [], 'unknown account gets nothing');
assert.deepStrictEqual(ownedOrdersOnly(mixed, undefined), [], 'no account gets nothing');
console.log('✓ Test 2 Passed: foreign and unowned dropped');

// ── Test 3 (stress): 500 mixed rows, exact isolation, no loss for me ──────────
console.log('\nTest 3 (stress): 500 mixed orders');
const owners = ['me', 'a', 'b', 'c'];
const big = [];
let mineCount = 0;
for (let i = 0; i < 500; i++) {
  if (i % 7 === 0) {
    big.push({ id: `orphan-${i}` }); // ownerless
  } else {
    const owner = owners[i % owners.length];
    if (owner === 'me') mineCount++;
    big.push({ id: `${owner}-${i}`, userId: owner });
  }
}
const survivors = ownedOrdersOnly(big, 'me');
assert.strictEqual(survivors.length, mineCount, 'exactly my orders survive');
assert.ok(survivors.every((o) => o.userId === 'me'), 'no foreign row survived');
assert.ok(survivors.every((o) => !String(o.id).startsWith('orphan')), 'no ownerless row survived');
for (const other of ['a', 'b', 'c']) {
  const rows = ownedOrdersOnly(big, other);
  assert.ok(rows.every((o) => o.userId === other), `${other} saw a foreign row`);
}
console.log(`✓ Test 3 Passed: ${mineCount}/500 survived for "me"; all other owners isolated`);

console.log('\n========================================');
console.log('🎉 ALL CLIENT ORDER-OWNERSHIP TESTS PASSED! 🎉');
console.log('========================================');
