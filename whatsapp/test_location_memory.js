import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolate the order store and run in dev mode so a pin matches the local shop.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-loc-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(tmpDir, 'catalog.json');
process.env.DUKAN_DEFAULT_OWNER_ID = 'owner-loc';

const { dukanOrders } = await import('./dukanOrders.js');
const {
  dukanBot,
  customerLocations,
  customerCarts,
  activeShops,
  rememberLocation,
  locationFor,
  SESSION_IDLE_TTL_MS,
  resetAllContext,
} = await import('./dukanBot.js');

console.log('--- RUNNING LOCATION MEMORY TESTS (T2) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const PIN = {
  latitude: 26.9124,
  longitude: 75.7873,
  name: 'Model Town',
  address: 'Model Town, Jaipur',
  fullDescription: 'Model Town, Jaipur',
};

// ── pure resolver ─────────────────────────────────────────────────────────────
resetAllContext();
const jid = '918888888888@s.whatsapp.net';

assert.strictEqual(locationFor(jid), null, 'no pin remembered yet');
rememberLocation(jid, PIN);
assert.deepStrictEqual(locationFor(jid), PIN, 'the remembered pin comes back');
ok('rememberLocation / locationFor round-trip');

assert.deepStrictEqual(locationFor(jid, PIN), PIN, 'an explicit pin always wins');
ok('an explicit pin overrides memory');

const stale = '917777777777@s.whatsapp.net';
rememberLocation(stale, PIN, Date.now() - SESSION_IDLE_TTL_MS - 5000);
assert.strictEqual(locationFor(stale), null, 'a pin older than the idle window is dropped');
assert.strictEqual(customerLocations.has(stale), false, 'the stale entry is evicted');
ok('a stale pin expires (no unbounded growth, no ghost address)');

resetAllContext();
assert.strictEqual(customerLocations.size, 0, 'reset wipes remembered pins');
ok('resetAllContext wipes location memory');

// ── end-to-end: the pin feeds the order, and the address is never re-asked ────
resetAllContext();
dukanOrders.clear();
const jid2 = '919999999999@s.whatsapp.net';
const msg = (text) => ({ remoteJid: jid2, text, pushName: 'Cust', from: '919999999999' });

await dukanBot.handleMessage(msg('/hey'), null);
await dukanBot.handleMessage(msg(''), null, PIN);

assert.ok(activeShops.has(jid2), 'the pin connects a shop');
assert.deepStrictEqual(locationFor(jid2), PIN, 'the pin is remembered after the handshake');
ok('the handshake pin is remembered');

// A later TEXT turn (no pin attached) must still see the remembered location.
customerCarts.set(jid2, {
  items: [{ id: 'p1', name: 'Parle-G Biscuits', category: 'Biscuits', price: 10, unit: 'pack', quantity: 2, total: 20 }],
  totalAmount: 20,
  customerName: 'Cust',
  deliveryAddress: '',
  location: null,
  updatedAt: Date.now(),
  status: 'staged',
});

const confirmed = await dukanBot.handleMessage(msg('confirm'), null);
assert.ok(confirmed && confirmed.newOrder, 'confirm places the order');
assert.strictEqual(confirmed.newOrder.deliveryAddress, PIN.fullDescription, 'the order carries the pin address, not a placeholder');
assert.strictEqual(confirmed.newOrder.userId, 'owner-loc', 'the order is owned by the matched shop');
assert.ok(confirmed.newOrder.location && confirmed.newOrder.location.latitude === PIN.latitude, 'the order carries the pin coordinates');
assert.ok(!/address/i.test(confirmed.reply) || /Address:/.test(confirmed.reply), 'the bot does not ask for the address again');
ok('a text turn after the pin still uses the pin for the order');

// ── "/hey" starts a fresh order: the old pin must not leak into it ────────────
await dukanBot.handleMessage(msg('/hey'), null);
assert.strictEqual(locationFor(jid2), null, 'a fresh /hey clears the previous pin');
ok('a new order starts without the previous pin');

resetAllContext();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================');
console.log(`🎉 ALL ${n} LOCATION MEMORY TESTS PASSED 🎉`);
console.log('========================================');
