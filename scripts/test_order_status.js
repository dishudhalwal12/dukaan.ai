import assert from 'assert';
import {
  isNewOrder,
  isPreparingGroup,
  isHistoryGroup,
  isCancelledOrRejected,
  isAcceptedSale,
  isFinalOrderStatus,
} from '../src/utils/orderStatus.ts';

console.log('--- RUNNING ORDER-STATUS TESTS ---');

// The engine speaks PENDING/ACCEPTED/OUT_FOR_DELIVERY/DELIVERED/CANCELLED; the
// UI enum speaks NEW/PREPARING/READY_FOR_PICKUP/COMPLETED/REJECTED/CANCELLED.
// A status must fall in the same tab whichever vocabulary it arrives in.
const ENGINE = ['PENDING', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'];
const UI = ['NEW', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED'];

console.log('\nTest 1: isNewOrder');
for (const s of ['NEW', 'PENDING']) assert.strictEqual(isNewOrder(s), true, `${s} is New`);
for (const s of ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED']) {
  assert.strictEqual(isNewOrder(s), false, `${s} is not New`);
}
for (const s of [null, undefined, '', 'garbage']) assert.strictEqual(isNewOrder(s), false, `${String(s)} is not New`);
console.log('✓ Test 1 Passed');

console.log('\nTest 2: isPreparingGroup');
for (const s of ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']) {
  assert.strictEqual(isPreparingGroup(s), true, `${s} is in Preparing`);
}
for (const s of ['NEW', 'PENDING', 'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED', null, undefined, 'garbage']) {
  assert.strictEqual(isPreparingGroup(s), false, `${String(s)} is not in Preparing`);
}
console.log('✓ Test 2 Passed');

console.log('\nTest 3: isHistoryGroup');
for (const s of ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED']) {
  assert.strictEqual(isHistoryGroup(s), true, `${s} is History`);
}
for (const s of ['NEW', 'PENDING', 'PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', null, undefined, 'garbage']) {
  assert.strictEqual(isHistoryGroup(s), false, `${String(s)} is not History`);
}
console.log('✓ Test 3 Passed');

console.log('\nTest 4: isCancelledOrRejected');
for (const s of ['CANCELLED', 'REJECTED']) assert.strictEqual(isCancelledOrRejected(s), true, `${s} is dead`);
for (const s of ['NEW', 'PENDING', 'PREPARING', 'ACCEPTED', 'COMPLETED', 'DELIVERED', null, undefined]) {
  assert.strictEqual(isCancelledOrRejected(s), false, `${String(s)} is alive`);
}
console.log('✓ Test 4 Passed');

console.log('\nTest 5: isAcceptedSale — a sale is accepted and not dead');
for (const s of ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DELIVERED']) {
  assert.strictEqual(isAcceptedSale(s), true, `${s} counts as a sale`);
}
for (const s of ['NEW', 'PENDING', 'REJECTED', 'CANCELLED', null, undefined, 'garbage']) {
  assert.strictEqual(isAcceptedSale(s), false, `${String(s)} is not a sale`);
}
console.log('✓ Test 5 Passed');

console.log('\nTest 6: the three tab groups partition every known status exactly once');
for (const s of [...new Set([...ENGINE, ...UI])]) {
  const hits = [isNewOrder(s), isPreparingGroup(s), isHistoryGroup(s)].filter(Boolean).length;
  assert.strictEqual(hits, 1, `${s} lands in exactly one tab group (got ${hits})`);
}
const unknownHits = [isNewOrder, isPreparingGroup, isHistoryGroup].filter((f) => f('garbage')).length;
assert.strictEqual(unknownHits, 0, 'an unknown status lands in no tab group');
console.log('✓ Test 6 Passed');

console.log('\nTest 7: isFinalOrderStatus stops a finished order from changing');
for (const s of ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED']) {
  assert.strictEqual(isFinalOrderStatus(s), true, `${s} is final`);
}
for (const s of ['NEW', 'PENDING', 'PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', null, undefined, 'garbage']) {
  assert.strictEqual(isFinalOrderStatus(s), false, `${String(s)} is not final`);
}
console.log('✓ Test 7 Passed');

console.log('\n========================================');
console.log('🎉 ALL ORDER-STATUS TESTS PASSED 🎉');
console.log('========================================');
