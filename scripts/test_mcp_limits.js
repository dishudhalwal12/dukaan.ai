import assert from 'assert';
import { LIMITS, READ_LIMIT, evaluateOrderLimits, checkOrderTotal, allowRead, resetReadLimit } from '../mcp/limits.js';

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

resetReadLimit();
for (let i = 0; i < READ_LIMIT.max; i++) assert.strictEqual(allowRead('u1', 1000), true);
assert.strictEqual(allowRead('u1', 1000), false, 'the read limit closes at the boundary');
assert.strictEqual(allowRead('u2', 1000), true, 'limits are per user');
assert.strictEqual(allowRead('u1', 1000 + READ_LIMIT.windowMs + 1), true, 'the window drains');
assert.strictEqual(allowRead(''), false);
ok('read calls have a per-user sliding-window guard');

console.log(`\nAll ${n} MCP limit checks passed.`);
