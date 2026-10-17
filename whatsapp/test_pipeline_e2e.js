import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-e2e-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(tmpDir, 'catalog.json');

const { dukanOrders } = await import('./dukanOrders.js');
const {
  dukanBot,
  activeShops,
  customerCarts,
  customerLocations,
  resetAllContext,
  shouldEngage,
  SERVICE_UNAVAILABLE_REPLY,
  NO_ITEMS_REPLY,
} = await import('./dukanBot.js');

console.log('--- RUNNING PIPELINE E2E TESTS (T5) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const J = { latitude: 26.9124, longitude: 75.7873, name: 'Model Town', address: 'Model Town, Jaipur', fullDescription: 'Model Town, Jaipur' };
const near = (km) => ({ latitude: J.latitude + km / 111.19, longitude: J.longitude });

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// Serve Supabase REST from a fixture; anything else is a surprise.
function stubCloud({ profiles = [], products = {}, failProfiles = false } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/business_profiles')) {
      if (failProfiles) return json({ message: 'down' }, 500);
      return json(profiles);
    }
    if (u.includes('/rest/v1/products')) {
      const m = u.match(/user_id=eq\.([^&]+)/);
      if (m) return json(products[decodeURIComponent(m[1])] || []);
      const all = Object.entries(products).flatMap(([user_id, rows]) => rows.map(() => ({ user_id })));
      return json(all);
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
}

const msg = (jid, text) => ({ remoteJid: jid, text, pushName: 'Cust', from: jid.replace(/@.*$/, '') });
const pin = (jid) => dukanBot.handleMessage(msg(jid, ''), null, J);
const connect = async (jid) => { await dukanBot.handleMessage(msg(jid, '/hey'), null); return pin(jid); };

function enableCloud() { process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'k'; }
function disableCloud() { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }

const CAT = (userId) => ([
  { user_id: userId, external_id: 'product_parle_g', name: 'Parle-G Biscuits', price: '10', stock: 50, stock_unit: 'pack', attributes: { category: 'Biscuits' } },
  { user_id: userId, external_id: 'product_amul_milk', name: 'Amul Taaza Milk', price: '27', stock: 20, stock_unit: '500ml', attributes: {} },
]);

// ── 1. dev mode with no owner: refuse, never invent one ───────────────────────
disableCloud();
delete process.env.DUKAN_DEFAULT_OWNER_ID;
resetAllContext();
dukanOrders.clear();
let reply = await connect('dev-no-owner@s.whatsapp.net');
assert.ok(!activeShops.has('dev-no-owner@s.whatsapp.net'), 'no owner source → no shop is connected');
assert.ok(/no Dukaan store/i.test(reply.reply), 'the customer is told no store serves them');
// A refusal is terminal: the bot stops answering, so the chat cannot keep spending tokens.
assert.strictEqual(shouldEngage('dev-no-owner@s.whatsapp.net', 'hello'), false, 'a refusal ends the chat');
assert.ok(/\/hey/.test(reply.reply), 'the refusal tells the customer how to start again');
ok('dev mode without an owner refuses to connect a shop');

// ── 2. registry unreachable: fail closed, no order ────────────────────────────
enableCloud();
resetAllContext();
stubCloud({ failProfiles: true });
reply = await connect('cloud-down@s.whatsapp.net');
assert.strictEqual(reply.reply, SERVICE_UNAVAILABLE_REPLY, 'an unreachable registry answers with the unavailable notice');
assert.ok(!activeShops.has('cloud-down@s.whatsapp.net'), 'no shop is connected on a registry outage');
assert.strictEqual(dukanOrders.getByOwner('any').length, 0);
assert.strictEqual(shouldEngage('cloud-down@s.whatsapp.net', 'hello'), false, 'a registry outage ends the chat');
ok('an unreachable registry fails closed and places no order');

// ── 3. every shop out of range: refuse with the distance ──────────────────────
resetAllContext();
stubCloud({ profiles: [{ user_id: 'far', store_name: 'Far Store', store_lat: 27.5, store_lng: 76.5 }], products: { far: CAT('far') } });
reply = await connect('too-far@s.whatsapp.net');
assert.ok(/km away/i.test(reply.reply), 'the customer is told how far the nearest store is');
assert.ok(/Nothing has been ordered/i.test(reply.reply));
assert.ok(!activeShops.has('too-far@s.whatsapp.net'), 'an out-of-range location connects no shop');
assert.strictEqual(shouldEngage('too-far@s.whatsapp.net', 'hello'), false, 'an out-of-range refusal ends the chat');
assert.ok(/\/hey/.test(reply.reply), 'the refusal tells the customer how to start again');
ok('a location beyond the radius is refused, order not placed');

// ── 4. an ownerless shop row is skipped ───────────────────────────────────────
resetAllContext();
stubCloud({ profiles: [{ user_id: '', store_name: 'Ghost', store_lat: near(0.2).latitude, store_lng: J.longitude }], products: {} });
reply = await connect('ghost@s.whatsapp.net');
assert.ok(!activeShops.has('ghost@s.whatsapp.net'), 'an ownerless shop is never connected');
ok('an ownerless shop row cannot serve an order');

// ── 5. nearest wins even when the farther shop is bigger ──────────────────────
resetAllContext();
stubCloud({
  profiles: [
    { user_id: 'near', store_name: 'Near Shop', ...near(0.3) },
    { user_id: 'farther', store_name: 'Farther Shop', ...near(3.0) },
  ],
  products: { near: CAT('near'), farther: [...CAT('farther'), ...CAT('farther'), ...CAT('farther')] },
});
reply = await connect('nearby@s.whatsapp.net');
assert.ok(activeShops.has('nearby@s.whatsapp.net'));
assert.strictEqual(activeShops.get('nearby@s.whatsapp.net').userId, 'near', 'proximity beats catalog size');
assert.strictEqual(activeShops.get('nearby@s.whatsapp.net').catalog.length, 2, 'the matched shop\'s own catalog is loaded');
ok('the nearest shop is chosen and its own catalog is loaded');

// the order is owned by that shop and carries the pin
customerCarts.set('nearby@s.whatsapp.net', {
  items: [{ id: 'product_parle_g', name: 'Parle-G Biscuits', price: 10, quantity: 1, total: 10 }],
  totalAmount: 10, customerName: 'Cust', deliveryAddress: '', location: null, updatedAt: Date.now(), status: 'staged',
});
const confirmed = await dukanBot.handleMessage(msg('nearby@s.whatsapp.net', 'confirm'), null);
assert.ok(confirmed.newOrder, 'the order is placed');
assert.strictEqual(confirmed.newOrder.userId, 'near', 'owned by the matched shop');
assert.strictEqual(confirmed.newOrder.deliveryAddress, J.fullDescription, 'carries the pin address');
// The order is placed: this conversation is over until the customer starts a new one.
assert.strictEqual(shouldEngage('nearby@s.whatsapp.net', 'hello'), false, 'a placed order ends the chat');
ok('a confirmed order is owned by the matched shop and carries the pin');

// ── 6. a shop with an empty catalog cannot take an order ──────────────────────
resetAllContext();
stubCloud({ profiles: [{ user_id: 'empty', store_name: 'Empty Shop', ...near(0.2) }], products: { empty: [] } });
reply = await connect('empty-shop@s.whatsapp.net');
assert.strictEqual(reply.reply, NO_ITEMS_REPLY, 'an empty catalog is refused, not filled from the global one');
assert.ok(!activeShops.has('empty-shop@s.whatsapp.net'), 'no shop is connected when it has nothing to sell');
assert.strictEqual(shouldEngage('empty-shop@s.whatsapp.net', 'hello'), false, 'an empty catalog ends the chat');
assert.ok(/\/hey/.test(reply.reply), 'the refusal tells the customer how to start again');
ok('a shop with an empty catalog refuses the order');

// ── 7. registry mode ignores DUKAN_DEFAULT_OWNER_ID entirely ──────────────────
resetAllContext();
process.env.DUKAN_DEFAULT_OWNER_ID = 'should-not-be-used';
stubCloud({ profiles: [], products: {} });
reply = await connect('no-shops@s.whatsapp.net');
assert.ok(!activeShops.has('no-shops@s.whatsapp.net'), 'an empty live registry never falls back to the default owner');
assert.ok(/no Dukaan store/i.test(reply.reply));
ok('a live registry with no shops never uses the dev owner');

// ── 8. a stale shop is cleared when the next pin matches nothing ──────────────
resetAllContext();
stubCloud({ profiles: [{ user_id: 'near', store_name: 'Near Shop', ...near(0.3) }], products: { near: CAT('near') } });
await connect('stale@s.whatsapp.net');
assert.ok(activeShops.has('stale@s.whatsapp.net'));
assert.ok(customerLocations.has('stale@s.whatsapp.net'), 'the first pin is remembered');
await dukanBot.handleMessage(msg('stale@s.whatsapp.net', '/hey'), null);
assert.ok(!customerLocations.has('stale@s.whatsapp.net'), 'a fresh /hey clears the previous pin');
stubCloud({ profiles: [{ user_id: 'near', store_name: 'Near Shop', ...near(9.0) }], products: { near: CAT('near') } });
await pin('stale@s.whatsapp.net');
assert.ok(!activeShops.has('stale@s.whatsapp.net'), 'a later unmatched pin clears the old shop');
ok('a fresh /hey clears the old pin and an unmatched re-pin clears the old shop');

delete process.env.DUKAN_DEFAULT_OWNER_ID;
disableCloud();
resetAllContext();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log(`🎉 ALL ${n} PIPELINE E2E TESTS PASSED 🎉`);
console.log('========================================');
