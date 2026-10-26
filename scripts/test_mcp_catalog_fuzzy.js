import assert from 'assert';
import { expandQueryTokens, searchCatalog } from '../mcp/catalog.js';

/**
 * A kirana types "Lifeboy", not "Lifebuoy". A customer types "soop". Neither
 * should be a dead end, and neither should turn an unrelated query into a match:
 * a wrong product on the checkout card is worse than "nothing found".
 */
console.log('--- RUNNING MCP CATALOG FUZZY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const catalog = [
  { productId: 'soap-1', name: 'Lifeboy Soap', price: '₹40', inStock: true, stock: 9 },
  { productId: 'milk-1', name: 'Amul Gold Milk (1L)', price: '₹68', inStock: true, stock: 30 },
];

assert.strictEqual(searchCatalog(catalog, 'sabun')[0]?.productId, 'soap-1', 'Hindi alias resolves');
ok('a Hindi shelf word finds the English product');

assert.strictEqual(searchCatalog(catalog, 'lifebuoy')[0]?.productId, 'soap-1', 'brand spelling is tolerated');
ok('a brand spelled differently from the catalog still matches');

assert.strictEqual(searchCatalog(catalog, 'soop')[0]?.productId, 'soap-1', 'a one-letter typo is tolerated');
ok('a single-letter typo still finds the shelf item');

assert.strictEqual(searchCatalog(catalog, 'cement').length, 0, 'an unrelated query matches nothing');
assert.strictEqual(searchCatalog(catalog, 'battery').length, 0);
ok('fuzzy matching does not invent unrelated matches');

assert.strictEqual(searchCatalog(catalog, 'milk')[0]?.productId, 'milk-1', 'exact matches keep winning');
ok('an exact match is still ranked first');

// ── aliases must not cross categories (nearby search ORs every token) ──────
const toothpasteTokens = expandQueryTokens('toothpaste');
assert.ok(!toothpasteTokens.includes('paste'), '"paste" would match tomato paste in another shop');
const soapTokens = expandQueryTokens('soap');
assert.ok(!soapTokens.includes('dettol'), '"dettol" would match Dettol handwash');
assert.ok(soapTokens.includes('sabun'), 'the shelf word is still expanded');

assert.deepStrictEqual(expandQueryTokens('so'), [], 'a two-letter fragment matches too much to search');
assert.deepStrictEqual(expandQueryTokens('2 pack of'), [], 'a quantity and a filler name no product');
ok('alias expansion cannot match another category, and 2-letter noise is dropped');

console.log(`\nAll ${n} catalog fuzzy checks passed.`);
