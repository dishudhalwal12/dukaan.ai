import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-gate-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(tmpDir, 'catalog.json');
process.env.DUKAN_DEFAULT_OWNER_ID = 'owner-gate';

const { dukanCatalog, searchInCatalog, resolveCatalogItem } = await import('./dukanCatalog.js');
const {
  resolveAndPriceItems,
  executeModelActions,
  composeGatedNarrative,
  activeShops,
  customerCarts,
  resetAllContext,
} = await import('./dukanBot.js');

console.log('--- RUNNING CATALOG GATE TESTS (T3) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// A small shop catalog, deliberately DIFFERENT from the global one:
// Parle-G costs ₹12 here (₹10 globally) and there is no Coca-Cola at all.
const SHOP = [
  { id: 's1', name: 'Parle-G Biscuits', category: 'Biscuits', price: 12, unit: 'pack', inStock: true, keywords: ['parle-g', 'parleg', 'biscuit'] },
  { id: 's2', name: 'Maggi 2-Minute Noodles', category: 'Snacks', price: 15, unit: 'packet', inStock: true, keywords: ['maggi', 'noodles'] },
  { id: 's3', name: 'Maggi Special Masala Noodles', category: 'Snacks', price: 20, unit: 'packet', inStock: true, keywords: ['maggi', 'masala'] },
  { id: 's4', name: 'Amul Taaza Milk', category: 'Dairy', price: 27, unit: '500ml', inStock: true, keywords: ['milk', 'amul'] },
];

// ── searchInCatalog is pure ───────────────────────────────────────────────────
assert.strictEqual(searchInCatalog([], 'parle-g').length, 0, 'an empty catalog matches nothing');
assert.strictEqual(searchInCatalog(SHOP, 'parle-g')[0].price, 12, 'search reads the catalog it is given');
assert.strictEqual(dukanCatalog.search('parle-g')[0].price, 10, 'the global catalog is untouched by a scoped search');
ok('searchInCatalog searches only the catalog it is given');

// ── resolveCatalogItem ────────────────────────────────────────────────────────
assert.strictEqual(resolveCatalogItem(SHOP, 'parle-g').status, 'ok');
assert.strictEqual(resolveCatalogItem(SHOP, 'parle-g').product.price, 12);
assert.strictEqual(resolveCatalogItem(SHOP, 'unobtainium').status, 'missing');
const amb = resolveCatalogItem(SHOP, 'maggi');
assert.strictEqual(amb.status, 'ambiguous', 'two distinct Maggi variants → ask, never guess');
assert(amb.options.length >= 2, 'the options are offered back');
ok('resolveCatalogItem returns ok / missing / ambiguous');

// ── resolveAndPriceItems is scoped ────────────────────────────────────────────
const scoped = resolveAndPriceItems([{ name: 'Parle-G Biscuits', quantity: 2 }], SHOP);
assert.strictEqual(scoped.items[0].price, 12, 'priced from the given catalog, not the global one');
ok('resolveAndPriceItems uses the supplied catalog');

const dropped = resolveAndPriceItems([{ name: 'Coca-Cola', quantity: 1 }], SHOP);
assert.strictEqual(dropped.items.length, 0, 'an item the shop does not stock is dropped, never priced');
assert.strictEqual(dropped.totalAmount, 0);
ok('resolveAndPriceItems drops what the shop does not stock');

assert.strictEqual(resolveAndPriceItems([{ name: 'Parle-G Biscuits', quantity: 1 }]).items[0].price, 10, 'no catalog argument → the global catalog (back-compat)');
ok('resolveAndPriceItems defaults to the global catalog');

// ── the gate drops out-of-catalog items and never invents a price ────────────
resetAllContext();
const jid = '911111111111@s.whatsapp.net';
const shop = { shopId: 'u-shop', userId: 'u-shop', shopName: 'Scoped Store', latitude: 26.9, longitude: 75.7, catalog: SHOP };
activeShops.set(jid, shop);

let res = executeModelActions([{ type: 'ADD_TO_CART', args: { name: 'Parle-G Biscuits', qty: 2 } }], jid, 'Cust', '911111111111', null);
assert.strictEqual(res.cart.items.length, 1, 'a stocked item is added');
assert.strictEqual(res.cart.items[0].price, 12, 'at the shop price, not the global ₹10');
assert.strictEqual(res.cart.totalAmount, 24);
assert.deepStrictEqual(res.unavailable, []);
ok('a stocked item is added at the shop price');

const jid2 = '912222222222@s.whatsapp.net';
activeShops.set(jid2, shop);
res = executeModelActions([{ type: 'ADD_TO_CART', args: { name: 'Coca-Cola', qty: 1 } }], jid2, 'Cust', '912222222222', null);
assert.strictEqual(res.cart.items.length, 0, 'an out-of-catalog item is never added');
assert.strictEqual(res.cart.items.find((i) => i.price === 30), undefined, 'no invented ₹30 line');
assert.deepStrictEqual(res.unavailable, ['Coca-Cola'], 'the dropped item is reported');
ok('an out-of-catalog item is dropped, not invented at ₹30');

const jid3 = '913333333333@s.whatsapp.net';
activeShops.set(jid3, shop);
res = executeModelActions([{ type: 'ADD_TO_CART', args: { name: 'maggi', qty: 1 } }], jid3, 'Cust', '913333333333', null);
assert.strictEqual(res.cart.items.length, 0, 'an ambiguous item is not guessed into the cart');
assert.strictEqual(res.clarifications.length, 1, 'the customer is asked to disambiguate');
assert(res.clarifications[0].options.length >= 2);
ok('an ambiguous item asks one question instead of guessing');

// ── the reply is rebuilt from the real cart ───────────────────────────────────
let out = composeGatedNarrative('Added 1 Coca-Cola for you.', { unavailable: ['Coca-Cola'], clarifications: [] });
assert(!/added 1 coca-cola/i.test(out), 'the false "added" claim is removed');
assert(/does not have/i.test(out) && /coca-cola/i.test(out), 'the customer is told it is not stocked');
ok('a dropped item removes the model\'s false claim and says so');

out = composeGatedNarrative('Which Maggi would you like?', { unavailable: [], clarifications: [{ name: 'maggi', options: amb.options }] });
assert(/maggi 2-minute/i.test(out), 'the clarification lists the real options');
ok('an ambiguous item produces a concrete either/or question');

out = composeGatedNarrative('Added 2 Parle-G for you.', { unavailable: [], clarifications: [] });
assert.strictEqual(out, 'Added 2 Parle-G for you.', 'a clean turn passes through untouched');
ok('a clean turn is untouched');

resetAllContext();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log(`🎉 ALL ${n} CATALOG GATE TESTS PASSED 🎉`);
console.log('========================================');
