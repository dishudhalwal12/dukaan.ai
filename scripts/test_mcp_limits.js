import assert from 'assert';
import { LIMITS, evaluateOrderLimits, checkOrderTotal } from '../mcp/limits.js';

console.log('--- RUNNING MCP LIMIT TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

assert.strictEqual(evaluateOrderLimits({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }).ok, true);
assert.strictEqual(evaluateOrderLimits({ quotesLastHour: LIMITS.quotesPerHour - 1, ordersLastHour: 0, activeOrdersForShop: 0 }).ok, true);
assert.strictEqual(evaluateOrderLimits({ quotesLastHour: LIMITS.quotesPerHour, ordersLastHour: 0, activeOrdersForShop: 0 }).code, 'rate_limited');
assert.strictEqual(evaluateOrderLimits({ quotesLastHour: 0, ordersLastHour: LIMITS.ordersPerHour, activeOrdersForShop: 0 }).code, 'rate_limited');
assert.strictEqual(evaluateOrderLimits({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: LIMITS.activeOrdersPerShop }).code, 'active_order_limit');
ok('limits fail closed at the boundary');

const total = checkOrderTotal(LIMITS.maxOrderPaise);
assert.strictEqual(total.ok, true, 'the cap itself is allowed');
assert.strictEqual(checkOrderTotal(LIMITS.maxOrderPaise + 1).code, 'order_too_large');
assert.strictEqual(checkOrderTotal(0).code, 'order_too_large');
assert.strictEqual(checkOrderTotal(Number.NaN).code, 'order_too_large');
ok('order total is capped and non-positive totals are rejected');

console.log(`\nAll ${n} MCP limit checks passed.`);
