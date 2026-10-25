import assert from 'assert';
import {
  MAX_LINES,
  MAX_QUANTITY,
  QUOTE_TTL_MS,
  buildQuote,
  isQuoteExpired,
  canCustomerCancel,
  customerStatusLabel,
} from '../mcp/orderRules.js';

console.log('--- RUNNING MCP ORDER RULE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const catalog = [
  { productId: 'milk', name: 'Amul Taaza Milk', pricePaise: 2700, price: '₹27', unit: '500ml', inStock: true },
  { productId: 'bread', name: 'Brown Bread', pricePaise: 4500, price: '₹45', unit: '400g', inStock: true },
  { productId: 'curd', name: 'Curd', pricePaise: 3500, price: '₹35', unit: '400g', inStock: false },
];
const now = Date.UTC(2026, 9, 26, 10, 0, 0);

const quote = buildQuote({
  items: [
    { product_id: 'milk', quantity: 2 },
    { product_id: 'bread', quantity: 1 },
  ],
  catalog,
  now,
});
assert.strictEqual(quote.ok, true);
assert.strictEqual(quote.totalPaise, 9900);
assert.strictEqual(quote.total, '₹99');
assert.deepStrictEqual(
  quote.items.map((i) => [i.productId, i.quantity, i.totalPaise]),
  [['milk', 2, 5400], ['bread', 1, 4500]]
);
assert.strictEqual(quote.expiresAt, new Date(now + QUOTE_TTL_MS).toISOString());
ok('buildQuote prices from the catalog, not from the request');

const duplicate = buildQuote({
  items: [{ product_id: 'milk', quantity: 1 }, { product_id: 'milk', quantity: 2 }],
  catalog,
  now,
});
assert.strictEqual(duplicate.items.length, 1);
assert.strictEqual(duplicate.items[0].quantity, 3);
assert.strictEqual(duplicate.totalPaise, 8100);
ok('duplicate lines are merged before pricing');

const missing = buildQuote({ items: [{ product_id: 'ghost', quantity: 1 }], catalog, now });
assert.strictEqual(missing.ok, false);
assert.strictEqual(missing.code, 'product_not_found');
assert.deepStrictEqual(missing.details.productIds, ['ghost']);

const soldOut = buildQuote({ items: [{ product_id: 'curd', quantity: 1 }], catalog, now });
assert.strictEqual(soldOut.ok, false);
assert.strictEqual(soldOut.code, 'product_unavailable');
assert.deepStrictEqual(soldOut.details.productIds, ['curd']);
ok('unknown and unavailable products fail closed');

for (const quantity of [0, -1, 1.5, MAX_QUANTITY + 1, 'two']) {
  const bad = buildQuote({ items: [{ product_id: 'milk', quantity }], catalog, now });
  assert.strictEqual(bad.ok, false, `quantity ${quantity} rejected`);
  assert.strictEqual(bad.code, 'quantity_invalid');
}
assert.strictEqual(buildQuote({ items: [], catalog, now }).code, 'items_required');
assert.strictEqual(buildQuote({ items: null, catalog, now }).code, 'items_required');
ok('quantities and empty baskets are validated');

const tooMany = buildQuote({
  items: Array.from({ length: MAX_LINES + 1 }, (_, i) => ({ product_id: `p${i}`, quantity: 1 })),
  catalog,
  now,
});
assert.strictEqual(tooMany.code, 'too_many_lines');
ok('line count is capped');

assert.strictEqual(isQuoteExpired({ expires_at: new Date(now - 1).toISOString() }, now), true);
assert.strictEqual(isQuoteExpired({ expires_at: new Date(now + 1).toISOString() }, now), false);
assert.strictEqual(isQuoteExpired({ expires_at: new Date(now).toISOString() }, now), true, 'the boundary is expired');
assert.strictEqual(isQuoteExpired(null, now), true);
ok('quote expiry is fail-closed');

for (const status of ['NEW', 'PENDING']) assert.strictEqual(canCustomerCancel(status), true);
for (const status of ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED', null]) {
  assert.strictEqual(canCustomerCancel(status), false, `${status} cannot be cancelled by the customer`);
}
ok('customers cancel only before the shop accepts');

assert.strictEqual(customerStatusLabel('NEW'), 'Waiting for the shop to accept');
assert.strictEqual(customerStatusLabel('PREPARING'), 'The shop is preparing your order');
assert.strictEqual(customerStatusLabel('READY_FOR_PICKUP'), 'Out for delivery');
assert.strictEqual(customerStatusLabel('COMPLETED'), 'Delivered');
assert.strictEqual(customerStatusLabel('REJECTED'), 'Rejected by the shop');
assert.strictEqual(customerStatusLabel('CANCELLED'), 'Cancelled');
assert.strictEqual(customerStatusLabel('what'), 'Unknown');
ok('status labels are customer-readable');

console.log(`\nAll ${n} MCP order-rule checks passed.`);
