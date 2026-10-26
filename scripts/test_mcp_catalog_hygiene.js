import assert from 'assert';
import { isPlaceholderImage, normaliseUnit, parsePackSize, searchCatalog, toPublicProduct } from '../mcp/catalog.js';

/**
 * Production catalog rows looked like this: unit "units", a `via.placeholder.com`
 * image, and three bars in stock next to a competitor's ninety. None of that is
 * wrong enough to block an order, and all of it makes the checkout card look
 * careless in front of a customer.
 */
console.log('--- RUNNING MCP CATALOG HYGIENE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

assert.strictEqual(normaliseUnit('units'), 'unit');
assert.strictEqual(normaliseUnit('Bars'), 'bar');
assert.strictEqual(normaliseUnit('packs'), 'pack');
assert.strictEqual(normaliseUnit('cartons'), 'carton');
assert.strictEqual(normaliseUnit('pcs'), 'piece');
assert.strictEqual(normaliseUnit(''), 'item');
ok('units are normalised to one vocabulary');

assert.strictEqual(parsePackSize('lifeboy 2 pack'), 2);
assert.strictEqual(parsePackSize('soap x3'), 3);
assert.strictEqual(parsePackSize('2 packets of maggi'), 2);
assert.strictEqual(parsePackSize('soap'), null);
assert.strictEqual(parsePackSize('500g atta'), null, 'grams are a size, not a pack count');
ok('a pack count is read from the way customers actually type it');

assert.strictEqual(isPlaceholderImage('https://via.placeholder.com/150/1A1A1A/E6E6FA?text=No+Image'), true);
assert.strictEqual(isPlaceholderImage('https://placehold.co/150'), true);
assert.strictEqual(isPlaceholderImage('https://dummyimage.com/150'), true);
assert.strictEqual(isPlaceholderImage('https://m.media-amazon.com/images/I/81x6KodxNZL.jpg'), false);
assert.strictEqual(isPlaceholderImage(null), false);
ok('placeholder image hosts are recognised');

const placeholder = toPublicProduct({
  external_id: 'p1', name: 'Lifeboy Soap', price: '₹40', stock: 3,
  stock_unit: 'units', image_url: 'https://via.placeholder.com/150/1A1A1A/E6E6FA?text=No+Image',
});
assert.strictEqual(placeholder.imageUrl, null, 'a placeholder is worse than no image');
assert.strictEqual(placeholder.unit, 'unit');
ok('a product drops its placeholder image and reports a normalised unit');

// Two rows a shopkeeper duplicated; the match is identical, so stock decides.
const products = [
  { productId: 'p-low', name: 'Lifeboy Soap', pricePaise: 4000, price: '₹40', unit: 'unit', inStock: true, stock: 2 },
  { productId: 'p-high', name: 'Lifeboy Soap', pricePaise: 4000, price: '₹40', unit: 'unit', inStock: true, stock: 40 },
];
const ranked = searchCatalog(products, 'lifeboy soap');
assert.strictEqual(ranked[0].productId, 'p-high', 'equal matches prefer the shop that has stock');
ok('a well-stocked match outranks a nearly sold-out one');

// Per-shop search keeps a sold-out row visible (the assistant must be able to say
// "sold out"), but it ranks below anything in stock and carries inStock: false.
const soldOut = searchCatalog(
  [
    { productId: 'p0', name: 'Lifeboy Soap', price: '₹40', inStock: false, stock: 0 },
    { productId: 'p1', name: 'Lifeboy Soap', price: '₹40', inStock: true, stock: 5 },
  ],
  'soap'
);
assert.strictEqual(soldOut[0].productId, 'p1', 'in-stock first');
assert.strictEqual(soldOut[1].productId, 'p0');
assert.strictEqual(soldOut[1].inStock, false, 'the sold-out row is still honest about stock');
ok('a sold-out match ranks last and says so');

console.log(`\nAll ${n} catalog hygiene checks passed.`);
