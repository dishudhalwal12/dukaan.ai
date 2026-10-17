import assert from 'assert';
import { mergePolledOrders, electPopupCandidates } from '../src/utils/orderPolling.ts';

console.log('--- RUNNING ORDER-POLLING TESTS ---');

const order = (over = {}) => ({
  id: 'DKN-1',
  status: 'PREPARING',
  total: 30,
  items: [{ name: 'Maggi', quantity: 1 }],
  ...over,
});

// ── Test 1: a no-op poll changes nothing and keeps the existing array order ──
console.log('\nTest 1: mergePolledOrders is a no-op when nothing moved');
{
  const a = order({ id: 'A', status: 'PREPARING' });
  const b = order({ id: 'B', status: 'NEW', total: 10 });
  const prev = [a, b];
  const result = mergePolledOrders(prev, [{ ...a }, { ...b }]);
  assert.strictEqual(result.changed, false, 'nothing moved → changed false');
  assert.deepStrictEqual(result.orders.map((o) => o.id), ['A', 'B'], 'existing order preserved');
  assert.deepStrictEqual(result.appeared, [], 'nothing appeared');
}
console.log('✓ Test 1 Passed');

// ── Test 2: a status or total move is reported as a change ──────────────────
console.log('\nTest 2: mergePolledOrders reports a real move');
{
  const prev = [order({ id: 'A', status: 'PREPARING', total: 30 })];
  const moved = mergePolledOrders(prev, [order({ id: 'A', status: 'READY_FOR_PICKUP', total: 30 })]);
  assert.strictEqual(moved.changed, true, 'status move → changed');
  assert.strictEqual(moved.orders[0].status, 'READY_FOR_PICKUP', 'fresh status wins');
  assert.strictEqual(moved.orders[0].total, 30);

  const reTotaled = mergePolledOrders(prev, [order({ id: 'A', status: 'PREPARING', total: 45 })]);
  assert.strictEqual(reTotaled.changed, true, 'total move → changed');
  assert.strictEqual(reTotaled.orders[0].total, 45, 'a positive fresh total wins');
}
console.log('✓ Test 2 Passed');

// ── Test 3: a zero total / empty items never erases what the client has ─────
console.log('\nTest 3: mergePolledOrders never blanks a known value');
{
  const prev = [order({ id: 'A', total: 30, items: [{ name: 'Maggi', quantity: 1 }] })];
  const result = mergePolledOrders(prev, [order({ id: 'A', total: 0, items: [] })]);
  assert.strictEqual(result.orders[0].total, 30, 'zero fresh total keeps the stored one');
  assert.deepStrictEqual(result.orders[0].items, prev[0].items, 'empty fresh items keep the stored ones');
}
console.log('✓ Test 3 Passed');

// ── Test 4: COMPLETED never regresses to an earlier status ──────────────────
console.log('\nTest 4: mergePolledOrders holds COMPLETED');
{
  const prev = [order({ id: 'A', status: 'COMPLETED' })];
  const result = mergePolledOrders(prev, [order({ id: 'A', status: 'PREPARING' })]);
  assert.strictEqual(result.orders[0].status, 'COMPLETED', 'a completed order stays completed');
}
console.log('✓ Test 4 Passed');

// ── Test 5: local-only orders survive, new ones land in front ───────────────
console.log('\nTest 5: mergePolledOrders keeps local rows and fronts new ones');
{
  const local = order({ id: 'LOCAL', status: 'NEW' });
  const prev = [order({ id: 'A' }), local];
  const fresh = [order({ id: 'B', status: 'NEW' }), order({ id: 'A' })];
  const result = mergePolledOrders(prev, fresh);
  assert.deepStrictEqual(result.orders.map((o) => o.id), ['B', 'A', 'LOCAL'], 'new first, prior order kept');
  assert.deepStrictEqual(result.appeared.map((o) => o.id), ['B'], 'only the unseen id appeared');
  assert.strictEqual(result.changed, true);
}
console.log('✓ Test 5 Passed');

// ── Test 6: the first poll after a fresh load elects nobody ─────────────────
console.log('\nTest 6: electPopupCandidates — priming swallows the backlog');
{
  const appeared = [order({ id: 'old-1' }), order({ id: 'old-2' })];
  assert.deepStrictEqual(
    electPopupCandidates(appeared, new Set(), false),
    [],
    'unprimed poll elects nothing — no storm of chimes for pre-existing orders',
  );
}
console.log('✓ Test 6 Passed');

// ── Test 7: afterwards an order is elected once, never twice ────────────────
console.log('\nTest 7: electPopupCandidates — one election per order');
{
  const appeared = [order({ id: 'new-1' }), order({ id: 'new-2' })];
  assert.deepStrictEqual(
    electPopupCandidates(appeared, new Set(), true),
    ['new-1', 'new-2'],
    'each freshly appeared order is elected, in order',
  );

  const seen = new Set(['new-1']);
  assert.deepStrictEqual(
    electPopupCandidates(appeared, seen, true),
    ['new-2'],
    'an order already recorded as seen is never elected again',
  );

  assert.deepStrictEqual(electPopupCandidates([], new Set(), true), [], 'nothing appeared → nobody elected');
}
console.log('✓ Test 7 Passed');

console.log('\n========================================');
console.log('🎉 ALL ORDER-POLLING TESTS PASSED 🎉');
console.log('========================================');
