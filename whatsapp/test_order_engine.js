import './test_setup_orders_file.js';
import assert from 'assert';
import { dukanCatalog } from './dukanCatalog.js';
import { dukanOrders } from './dukanOrders.js';
import { resolveAndPriceItems, extractOrderFromSummaryText, parseOpenRouterReply, activeShops } from './dukanBot.js';

console.log('--- RUNNING ORDER ENGINE & CATALOG VALIDATION TESTS ---');

// Test 1: Catalog Search & Aliasing
console.log('Test 1: Catalog Search & Aliases');
const searchParleG = dukanCatalog.search('parle-g');
assert(searchParleG.length > 0, 'Failed to find parle-g in catalog');
assert.strictEqual(searchParleG[0].price, 10, 'Parle-G price in catalog must be ₹10');

const searchParleSpaces = dukanCatalog.search('parle g');
assert(searchParleSpaces.length > 0, 'Failed to find "parle g"');

const searchBiscuit = dukanCatalog.search('biscuit');
assert(searchBiscuit.length > 0, 'Failed to find item by keyword "biscuit"');
console.log('✓ Test 1 Passed: Catalog search correctly matches aliases and returns ₹10 for Parle-G');

// Test 2: Deterministic Item Pricing (Overriding AI Price Hallucination)
console.log('\nTest 2: Deterministic Item Pricing & Total Calculation');
const hallucinatedInput = [
  { name: 'Parle-G Biscuits (product_parle_g)', quantity: 10, price: 80 }
];

const pricedResult = resolveAndPriceItems(hallucinatedInput);
assert.strictEqual(pricedResult.items.length, 1, 'Should resolve 1 item');
assert.strictEqual(pricedResult.items[0].price, 10, 'Price must be overridden to catalog price ₹10');
assert.strictEqual(pricedResult.items[0].quantity, 10, 'Quantity must be 10');
assert.strictEqual(pricedResult.items[0].total, 100, 'Total must be 10 * 10 = 100, not 800');
assert.strictEqual(pricedResult.totalAmount, 100, 'Order totalAmount must be 100');
console.log('✓ Test 2 Passed: resolveAndPriceItems successfully crushed AI price hallucination and computed ₹100');

// Test 3: Natural Language Summary Extraction with Deterministic Math
console.log('\nTest 3: Natural Language Summary Extraction');
const summaryText = `
*Order Summary*
- Item: Parle-G Biscuits
- Quantity: 10 packs
- Price: ₹80 per pack
- Total: ₹800
- Delivery Address: Jaipur Street No. 17
`;

const extracted = extractOrderFromSummaryText(summaryText, 'Jaipur Street No. 17');
assert(extracted !== null, 'Failed to extract summary');
assert.strictEqual(extracted.deliveryAddress, 'Jaipur Street No. 17');
assert.strictEqual(extracted.items[0].price, 10, 'Extracted price must be normalized to catalog price ₹10');
assert.strictEqual(extracted.items[0].quantity, 10, 'Extracted quantity must be 10');
assert.strictEqual(extracted.totalAmount, 100, 'Extracted totalAmount must be ₹100');
console.log('✓ Test 3 Passed: Summary text with hallucinated ₹800 correctly parsed to authoritative ₹100');

// Test 4: OpenRouter Reply Parser (Layer 1 JSON) with Location Data
console.log('\nTest 4: OpenRouter Reply Layer 1 JSON & Location Pin Integration');
const fakeAIReply = `
Order confirmed! 🎉
\`\`\`json
{
  "action": "CREATE_ORDER",
  "customerName": "Pulkit Khowal",
  "deliveryAddress": "Jaipur Street No. 17",
  "items": [
    { "name": "Parle-G Biscuits", "quantity": 10, "price": 80, "total": 800 }
  ],
  "totalAmount": 800
}
\`\`\`
`;

const locationData = {
  latitude: 26.9124,
  longitude: 75.7873,
  mapsUrl: 'https://maps.google.com/?q=26.9124,75.7873',
  fullDescription: 'Jaipur Street No. 17'
};

const jid4 = '917300372323@s.whatsapp.net';
// An order requires a matched shop and that shop's own catalog, so connect one.
activeShops.set(jid4, {
  shopId: 'shop-1',
  shopName: 'Test Store',
  userId: 'owner-engine',
  latitude: 26.9124,
  longitude: 75.7873,
  catalog: [{ id: 'p1', name: 'Parle-G Biscuits', category: 'Biscuits', price: 10, unit: 'pack', inStock: true, keywords: ['parle-g', 'parleg', 'biscuit'] }],
});

const parseResult = parseOpenRouterReply(
  fakeAIReply,
  jid4,
  '917300372323',
  'Pulkit Khowal',
  'yes',
  locationData
);

assert(parseResult.newOrder !== null, 'Failed to create order from Layer 1');
const order = parseResult.newOrder;
assert.strictEqual(order.totalAmount, 100, `Order totalAmount must be 100, was: ${order.totalAmount}`);
assert.strictEqual(order.items[0].price, 10, `Item unit price must be 10, was: ${order.items[0].price}`);
assert.strictEqual(order.items[0].total, 100, `Item total must be 100, was: ${order.items[0].total}`);
assert(order.location !== null, 'Location data should be preserved on order');
assert.strictEqual(order.location.mapsUrl, locationData.mapsUrl, 'Maps URL should match');
assert(parseResult.reply.includes('₹100'), 'Authoritative confirmation reply must cite ₹100');
assert(!parseResult.reply.includes('₹800'), 'Confirmation reply must not cite hallucinated ₹800');
console.log('✓ Test 4 Passed: Order # ' + order.id + ' created with exact total ₹100 and mapsUrl');

// Test 5: Order Lifecycle Transitions & Status Monotonicity
console.log('\nTest 5: Order Lifecycle Transitions (Accept -> Ready -> Delivered)');
const readyOrder = dukanOrders.updateStatus(order.id, 'OUT_FOR_DELIVERY');
assert.strictEqual(readyOrder.status, 'OUT_FOR_DELIVERY');

const deliveredOrder = dukanOrders.updateStatus(order.id, 'DELIVERED');
assert.strictEqual(deliveredOrder.status, 'DELIVERED');
console.log('✓ Test 5 Passed: Order successfully progressed from PENDING -> OUT_FOR_DELIVERY -> DELIVERED');

// Test 6: Order ID Monotonicity
console.log('\nTest 6: Order ID Monotonicity Check');
const nextOrder = dukanOrders.createOrder({
  customerJid: '919876543210@s.whatsapp.net',
  customerPhone: '919876543210',
  customerName: 'Test Next',
  deliveryAddress: 'Delhi',
  items: [{ name: 'Parle-G Biscuits', price: 10, quantity: 2, total: 20 }],
  totalAmount: 20
});
const curNum = parseInt(order.id.replace('DKN-', ''), 10);
const nextNum = parseInt(nextOrder.id.replace('DKN-', ''), 10);
assert(nextNum > curNum, `Next order ID number (${nextNum}) must be strictly greater than previous (${curNum})`);
console.log(`✓ Test 6 Passed: Monotonic IDs confirmed (${order.id} -> ${nextOrder.id})`);

console.log('\n========================================');
console.log('🎉 ALL AUTOMATED ENGINE TESTS PASSED! 🎉');
console.log('========================================');
