import './test_setup_orders_file.js';
import assert from 'assert';
import { dukanOrders, isFinalStatus } from './dukanOrders.js';

console.log('--- RUNNING FINAL ORDER STATE TESTS ---');

dukanOrders.clear();
const order = dukanOrders.createOrder({
  customerJid: '919999999999@s.whatsapp.net',
  customerPhone: '919999999999',
  customerName: 'Tester',
  deliveryAddress: 'Test address',
  items: [{ name: 'Maggi', quantity: 1, price: 15, total: 15 }],
  totalAmount: 15,
  userId: 'owner-1',
});

assert.strictEqual(isFinalStatus('DELIVERED'), true);
assert.strictEqual(isFinalStatus('REJECTED'), true);
assert.strictEqual(isFinalStatus('CANCELLED'), true);
assert.strictEqual(isFinalStatus('PENDING'), false);
assert.strictEqual(isFinalStatus('ACCEPTED'), false);
console.log('✓ final-status predicate');

const delivered = dukanOrders.updateStatus(order.id, 'DELIVERED');
assert.strictEqual(delivered.status, 'DELIVERED');

const rejectedAfterDelivery = dukanOrders.updateStatus(order.id, 'REJECTED', {
  rejectReason: 'Item temporarily unavailable',
});
assert.strictEqual(rejectedAfterDelivery, null, 'a delivered order cannot be rejected later');
assert.strictEqual(dukanOrders.getById(order.id).status, 'DELIVERED', 'the stored status must not change');

const acceptedAfterDelivery = dukanOrders.updateStatus(order.id, 'ACCEPTED');
assert.strictEqual(acceptedAfterDelivery, null, 'no transition out of a final status is allowed');
assert.strictEqual(dukanOrders.getById(order.id).status, 'DELIVERED');
console.log('✓ delivered orders are immutable');

const rejected = dukanOrders.createOrder({
  customerJid: '918888888888@s.whatsapp.net',
  customerPhone: '918888888888',
  customerName: 'Tester',
  deliveryAddress: 'Test address',
  items: [{ name: 'Maggi', quantity: 1, price: 15, total: 15 }],
  totalAmount: 15,
  userId: 'owner-1',
});
dukanOrders.updateStatus(rejected.id, 'REJECTED');
assert.strictEqual(dukanOrders.updateStatus(rejected.id, 'DELIVERED'), null, 'rejected is final too');
assert.strictEqual(dukanOrders.getById(rejected.id).status, 'REJECTED');
console.log('✓ rejected orders are immutable');

const pending = dukanOrders.createOrder({
  customerJid: '917777777777@s.whatsapp.net',
  customerPhone: '917777777777',
  customerName: 'Tester',
  deliveryAddress: 'Test address',
  items: [{ name: 'Maggi', quantity: 1, price: 15, total: 15 }],
  totalAmount: 15,
  userId: 'owner-1',
});
assert.strictEqual(dukanOrders.updateStatus(pending.id, 'ACCEPTED').status, 'ACCEPTED');
assert.strictEqual(dukanOrders.updateStatus(pending.id, 'DELIVERED').status, 'DELIVERED');
console.log('✓ a live order still moves through its normal statuses');

console.log('\n========================================');
console.log('🎉 ALL FINAL ORDER STATE TESTS PASSED 🎉');
console.log('========================================');
