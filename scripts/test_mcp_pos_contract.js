import assert from 'assert';
import { publicOrder } from '../mcp/data.js';

/**
 * The shopkeeper's popup reads `src/types.ts`:
 *
 *   customer: { name, whatsappNumber, address, mapsUrl?, latitude?, longitude? }
 *   items:    { productId, name, quantity, price }[]
 *
 * The order row is written by the `mcp_place_order` RPC and projected to the
 * assistant by `publicOrder()`. Both have to carry that shape, otherwise the
 * assistant says "delivered to 29, infront of hospital" while the popup has no
 * phone number to call, or no pin to open in Maps.
 */
console.log('--- RUNNING MCP POS CONTRACT TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// Shape produced by public.mcp_place_order (see the schema test for the DB side).
const row = {
  external_id: 'MCP-20261026-147562',
  user_id: '33333333-3333-4333-8333-333333333333',
  customer_user_id: '11111111-1111-4111-8111-111111111111',
  status: 'NEW',
  payment_method: 'COD',
  total: 80,
  delivery_address: '29, infront of hospital, Sambhar, 303604',
  created_at: '2026-10-26T17:35:55.732925+00:00',
  updated_at: '2026-10-26T17:35:55.732925+00:00',
  channel: 'mcp',
  items: [
    { productId: 'prod_1793035749453', name: 'Lifeboy Soap', price: '₹40', unit: 'bars', quantity: 2, total: '₹80' },
  ],
  customer: {
    name: 'Raj Sharma',
    whatsappNumber: '+917678798767',
    address: '29, infront of hospital, Sambhar, 303604',
    mapsUrl: 'https://maps.google.com/?q=26.9091549264455,75.1845856022345',
    latitude: 26.9091549264455,
    longitude: 75.1845856022345,
    location: {
      latitude: 26.9091549264455,
      longitude: 75.1845856022345,
      mapsUrl: 'https://maps.google.com/?q=26.9091549264455,75.1845856022345',
    },
  },
};

const order = publicOrder(row, { public_shop_id: 'shop_9f12b92510', store_name: 'Ramu General Store' });

const CUSTOMER_KEYS = ['name', 'whatsappNumber', 'address', 'mapsUrl', 'latitude', 'longitude'];
for (const key of CUSTOMER_KEYS) {
  assert.ok(order.customer && Object.hasOwn(order.customer, key), `publicOrder must expose customer.${key} for the POS`);
}
assert.strictEqual(order.customer.name, 'Raj Sharma');
assert.strictEqual(order.customer.whatsappNumber, '+917678798767');
assert.strictEqual(order.customer.address, '29, infront of hospital, Sambhar, 303604');
assert.strictEqual(order.customer.latitude, 26.9091549264455);
assert.strictEqual(order.customer.longitude, 75.1845856022345);
assert.match(order.customer.mapsUrl, /^https:\/\/maps\.google\.com\/\?q=26\.909/);
ok('the tool-facing order carries every customer field the popup reads');

for (const key of ['productId', 'name', 'quantity', 'price']) {
  assert.ok(Object.hasOwn(order.items[0], key), `items[0].${key} is part of the POS OrderItem`);
}
assert.strictEqual(order.channel, 'mcp');
assert.strictEqual(order.total_display, '₹80');
ok('items, channel, and the pre-formatted total match the POS order shape');

console.log(`\nAll ${n} POS contract checks passed.`);
