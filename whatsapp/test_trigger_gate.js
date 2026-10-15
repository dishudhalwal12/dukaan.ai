import assert from 'assert';
import {
  isBotTrigger,
  stripBotTrigger,
  shouldEngage,
  activateSession,
  isSessionActive,
  endSession,
  resetAllContext,
  isAwaitingLocation,
  activeShops,
  customerCarts,
  SESSION_IDLE_TTL_MS,
  WELCOME_REPLY,
  LOCATION_HOWTO_REPLY,
  stripModelCartBlock,
  formatOrderConfirmation,
  extractStatedQuantity,
  looksLikeAddress,
  mentionsProduct,
  reconcileMissedActions,
  dukanBot,
} from './dukanBot.js';
import { dukanCatalog } from './dukanCatalog.js';

console.log('--- RUNNING TRIGGER GATE & SESSION WINDOW TESTS ---');

let passed = 0;
function ok(label, fn) {
  fn();
  passed++;
  console.log(`✓ ${label}`);
}

const JID = (n) => `${n}@s.whatsapp.net`;
const MIN = 60 * 1000;

// Test 1: "/hey" trigger detection
ok('Test 1: only "/hey" triggers, plain greetings do not', () => {
  ['/hey', '/HEY', '  /hey  ', '/hey 2 maggi please', '/hey, need milk'].forEach(t =>
    assert.strictEqual(isBotTrigger(t), true, `"${t}" must trigger`)
  );
  ['hey', 'Hey there', 'hello', 'hi', 'hello /hey', '', '   ', '/heyyy', '/help'].forEach(t =>
    assert.strictEqual(isBotTrigger(t), false, `"${t}" must NOT trigger`)
  );
});

// Test 2: trigger stripping keeps the request that follows "/hey"
ok('Test 2: stripBotTrigger removes only the "/hey" token', () => {
  assert.strictEqual(stripBotTrigger('/hey'), '');
  assert.strictEqual(stripBotTrigger('/hey  '), '');
  assert.strictEqual(stripBotTrigger('/hey 2 maggi'), '2 maggi');
  assert.strictEqual(stripBotTrigger('/hey, need milk'), ', need milk');
});

// Test 3: an untouched chat is never engaged (this is the whole point of the fix)
ok('Test 3: fresh chat + non-trigger message => not engaged', () => {
  const jid = JID('gate-fresh');
  assert.strictEqual(shouldEngage(jid, 'hello bhai'), false);
  assert.strictEqual(shouldEngage(jid, 'kya haal hai'), false);
});

// Test 4: "/hey" engages, even with no prior session
ok('Test 4: "/hey" engages a brand-new chat', () => {
  const jid = JID('gate-trigger');
  assert.strictEqual(shouldEngage(jid, '/hey'), true);
});

// Test 5: after activation, follow-up messages stay engaged
ok('Test 5: an activated session keeps follow-ups engaged', () => {
  const jid = JID('gate-active');
  const t0 = 1_000_000_000;
  activateSession(jid, t0);
  assert.strictEqual(shouldEngage(jid, 'add 2 maggi', t0 + 5 * MIN), true);
  assert.strictEqual(shouldEngage(jid, 'confirm', t0 + 11 * MIN), true);
});

// Test 6: idle window boundary (12 min)
ok('Test 6: session expires only after the 12-min idle window', () => {
  const jid = JID('gate-ttl');
  const t0 = 2_000_000_000;
  activateSession(jid, t0);
  assert.strictEqual(isSessionActive(jid, t0 + SESSION_IDLE_TTL_MS), true, 'active AT the boundary');
  assert.strictEqual(isSessionActive(jid, t0 + SESSION_IDLE_TTL_MS + 1), false, 'expired just past the boundary');
  assert.strictEqual(shouldEngage(jid, 'hello', t0 + SESSION_IDLE_TTL_MS + 1), false, 'expired chat ignores non-trigger');
  assert.strictEqual(shouldEngage(jid, '/hey', t0 + SESSION_IDLE_TTL_MS + 1), true, '/hey always re-engages');
});

// Test 7: the window slides on each engaged message
ok('Test 7: each engaged message slides the window forward', () => {
  const jid = JID('gate-slide');
  const t0 = 3_000_000_000;
  activateSession(jid, t0);
  const t1 = t0 + 11 * MIN;
  assert.strictEqual(isSessionActive(jid, t1), true);
  activateSession(jid, t1); // what handleMessage does per engaged message
  assert.strictEqual(isSessionActive(jid, t1 + 11 * MIN), true, 'window moved with activity');
  assert.strictEqual(isSessionActive(jid, t0 + SESSION_IDLE_TTL_MS + 1), true, 'no longer bound to the old start');
});

// Test 8: endSession revokes immediately
ok('Test 8: endSession revokes the chat at once', () => {
  const jid = JID('gate-end');
  activateSession(jid);
  assert.strictEqual(shouldEngage(jid, 'hello'), true);
  endSession(jid);
  assert.strictEqual(shouldEngage(jid, 'hello'), false);
});

// Test 9: server restart wipes all sessions
ok('Test 9: resetAllContext clears every session', () => {
  const jid = JID('gate-reset');
  activateSession(jid);
  assert.strictEqual(shouldEngage(jid, 'hello'), true);
  resetAllContext();
  assert.strictEqual(shouldEngage(jid, 'hello'), false);
});

// Test 10: a bare "/hey" returns the welcome message without calling the AI
const welcome = await dukanBot.handleMessage({
  remoteJid: JID('gate-welcome'),
  text: '/hey',
  pushName: 'Tester',
  from: '919999999999',
});
assert.strictEqual(welcome.reply, WELCOME_REPLY, '"/hey" must return the welcome reply verbatim');
assert.strictEqual(welcome.newOrder, null, '"/hey" must not create an order');
assert.strictEqual(isSessionActive(JID('gate-welcome')), true, '"/hey" must open a live session');
passed++;
console.log('✓ Test 10: bare "/hey" returns WELCOME_REPLY and opens a session');

// Test 11: the exact call site server.js uses (dukanBot.shouldEngage)
ok('Test 11: dukanBot.shouldEngage gates the server entry point', () => {
  const jid = JID('gate-server');
  assert.strictEqual(typeof dukanBot.shouldEngage, 'function', 'dukanBot.shouldEngage must exist');
  assert.strictEqual(dukanBot.shouldEngage(jid, 'random contact message'), false);
  assert.strictEqual(dukanBot.shouldEngage(jid, '/hey'), true);
  activateSession(jid);
  assert.strictEqual(dukanBot.shouldEngage(jid, 'now engaged'), true);
});

// Test 12: a fresh cart keeps the chat engaged even after the idle window lapses,
// so a customer who built a cart is not silently ignored when they later confirm.
ok('Test 12: a fresh cart engages the chat; a stale cart does not', () => {
  const jid = JID('gate-cart');
  const t0 = 4_000_000_000;
  customerCarts.set(jid, {
    items: [{ id: 'p1', name: 'Maggi', price: 15, quantity: 2, total: 30 }],
    totalAmount: 30,
    customerName: 'Tester',
    deliveryAddress: '',
    location: null,
    updatedAt: t0,
    status: 'staged',
  });
  assert.strictEqual(shouldEngage(jid, 'confirm', t0 + 11 * MIN), true, 'fresh cart must stay engaged');
  assert.strictEqual(
    shouldEngage(jid, 'confirm', t0 + SESSION_IDLE_TTL_MS + 1),
    false,
    'stale cart must not hold the chat open forever'
  );
  customerCarts.delete(jid);
});

// Test 13: cancelling must not kill the session — the customer may want to reorder.
const keepJid = JID('gate-keep');
activateSession(keepJid);
const cancelReply = await dukanBot.handleMessage({
  remoteJid: keepJid,
  text: 'cancel',
  pushName: 'Tester',
  from: '000000000000000',
});
assert.ok(cancelReply && cancelReply.reply, 'cancel must still produce a reply');
assert.strictEqual(isSessionActive(keepJid), true, 'cancel must not close the session');
passed++;
console.log('✓ Test 13: cancelling keeps the session alive for a reorder');

// Test 14: "/hey" starts the location handshake instead of ordering straight away
const flowJid = JID('flow-location');
const heyReply = await dukanBot.handleMessage({
  remoteJid: flowJid,
  text: '/hey',
  pushName: 'Tester',
  from: '000000000000001',
});
assert.strictEqual(heyReply.reply, WELCOME_REPLY, '/hey must return the location-first welcome');
assert.strictEqual(isAwaitingLocation(flowJid), true, '/hey must put the chat in the location handshake');
passed++;
console.log('✓ Test 14: "/hey" asks for the location pin first');

// Test 15: a text message instead of a pin gets the walkthrough (no AI call)
const howtoReply = await dukanBot.handleMessage({
  remoteJid: flowJid,
  text: '2 maggi dena',
  pushName: 'Tester',
  from: '000000000000001',
});
assert.strictEqual(howtoReply.reply, LOCATION_HOWTO_REPLY, 'text before a pin must return the walkthrough');
assert.strictEqual(isAwaitingLocation(flowJid), true, 'still waiting for the pin');
passed++;
console.log('✓ Test 15: texting before the pin returns the walkthrough, not an AI reply');

// Test 16: the location pin completes the handshake and connects a shop
const ackReply = await dukanBot.handleMessage(
  { remoteJid: flowJid, text: '', pushName: 'Tester', from: '000000000000001' },
  null,
  { latitude: 26.9124, longitude: 75.7873, name: 'Model Town', address: 'Model Town, Jaipur', fullDescription: 'Model Town, Jaipur' }
);
assert.ok(/connected to/.test(ackReply.reply), 'location must produce a "connected to <shop>" reply');
assert.strictEqual(isAwaitingLocation(flowJid), false, 'handshake complete after the pin');
assert.ok(activeShops.has(flowJid), 'the matched shop must be remembered for this customer');
assert.strictEqual(activeShops.get(flowJid).shopName, 'Dukaan Store', 'local fallback shop until Supabase is wired');
passed++;
console.log('✓ Test 16: the location pin connects a shop and ends the handshake');

// Test 17: the engine strips any cart block the MODEL wrote itself.
// This is the fix for "2x ₹28 in the words, 4x ₹56 in the footer".
ok('Test 17: stripModelCartBlock removes the model-written cart, keeps the narrative', () => {
  const modelReply = 'Added 2 Maggi for you.\n\n*Current Cart:*\n• 4x Maggi @ ₹14 = ₹56\n\n*Cart Total:* ₹56\n\nReply CONFIRM to place the order.';
  assert.strictEqual(stripModelCartBlock(modelReply), 'Added 2 Maggi for you.');
  const plain = 'We do not stock Coke, but Bisleri water is available.';
  assert.strictEqual(stripModelCartBlock(plain), plain, 'normal replies must pass through untouched');
  assert.strictEqual(stripModelCartBlock(''), '');
});

// Test 18: one canonical order confirmation for every engine path
ok('Test 18: formatOrderConfirmation is the single order-placed message', () => {
  const text = formatOrderConfirmation({
    id: 'DKN-1947',
    items: [{ quantity: 2, name: 'Maggi 2-Minute Masala Noodles (70g)', price: 14, total: 28 }],
    totalAmount: 28,
    deliveryAddress: 'House 12, Test Street, Model Town, Jaipur',
  });
  assert.ok(text.includes('#DKN-1947'), 'carries the order id');
  assert.ok(text.includes('₹28'), 'carries the total');
  assert.ok(text.includes('House 12'), 'carries the address');
  assert.strictEqual(formatOrderConfirmation(null), '');
});

// Test 19: quantity parsing must never mistake a price for a quantity
ok('Test 19: extractStatedQuantity reads the real quantity, not the price', () => {
  const maggi = { name: 'Maggi 2-Minute Masala Noodles (70g)', keywords: ['maggi', 'noodles'] };
  assert.strictEqual(extractStatedQuantity('add 2 maggi ₹14 pack', maggi), 2);
  assert.strictEqual(extractStatedQuantity('maggi 2 kar do', maggi), 2);
  assert.strictEqual(extractStatedQuantity('maggi ₹14 wali', maggi), 0, '₹14 is a price, not a quantity');
  assert.strictEqual(extractStatedQuantity('ye maggi hata do', maggi), 0);
});

// Test 20: address detection separates addresses from chat
ok('Test 20: looksLikeAddress spots a real address and ignores chat', () => {
  assert.strictEqual(looksLikeAddress('House 12, Test Street, Model Town, Jaipur'), true);
  assert.strictEqual(looksLikeAddress('Jaipur 302001'), true);
  assert.strictEqual(looksLikeAddress('2 maggi please'), false);
  assert.strictEqual(looksLikeAddress('kya haal hai'), false);
});

// Test 21: THE doubling guarantee. The model drops the tag, so the safety net
// must settle on 2 — not 4 — and must not fire when the model is only asking.
ok('Test 21: reconcileMissedActions settles quantity instead of doubling it', () => {
  const maggi = dukanCatalog.search('maggi')[0];
  assert.ok(maggi, 'catalog must contain Maggi for this test');

  const jid = JID('reconcile-double');
  customerCarts.set(jid, {
    items: [{ id: maggi.id, name: maggi.name, price: maggi.price, unit: maggi.unit, quantity: 2, total: maggi.price * 2 }],
    totalAmount: maggi.price * 2,
    customerName: 'Tester',
    deliveryAddress: '',
    location: null,
    updatedAt: Date.now(),
    status: 'staged',
  });

  const result = reconcileMissedActions(
    'you said cart empty but showed items. anyway yes add 2 maggi ₹14 pack',
    'Adding 2 *Maggi 2-Minute Masala Noodles (70g)*.',
    [],
    jid,
    'Tester',
    '000000000000002',
    null
  );
  const line = result.cart.items.find(it => it.id === maggi.id);
  assert.strictEqual(line.quantity, 2, 'stated quantity must SET the final count, not add to it');
  assert.strictEqual(result.cart.totalAmount, maggi.price * 2, 'total must match the final quantity');

  // A question is not an action.
  assert.strictEqual(
    reconcileMissedActions('maggi chahiye', 'Shall I add 2 Maggi to your cart?', [], JID('reconcile-q'), 'T', '0', null),
    null,
    'asking permission must not change the cart'
  );

  customerCarts.delete(jid);
});

// Test 22: a headless receipt line the model wrote is dropped too
ok('Test 22: stripModelCartBlock drops orphan receipt lines', () => {
  const messy = 'Adding 2 *Maggi*.\n\n• 2x Maggi 2-Minute Masala Noodles (70g) @ ₹14 = ₹28';
  assert.strictEqual(stripModelCartBlock(messy), 'Adding 2 *Maggi*.');
});

// Test 23: the address safety net saves what the model only claimed to save
ok('Test 23: reconcileMissedActions saves an address the model forgot to save', () => {
  const maggi = dukanCatalog.search('maggi')[0];
  const jid = JID('reconcile-addr');
  customerCarts.set(jid, {
    items: [{ id: maggi.id, name: maggi.name, price: maggi.price, unit: maggi.unit, quantity: 2, total: maggi.price * 2 }],
    totalAmount: maggi.price * 2,
    customerName: 'Tester',
    deliveryAddress: '',
    location: null,
    updatedAt: Date.now(),
    status: 'staged',
  });

  const res = reconcileMissedActions(
    'House 12, Test Street, Model Town, Jaipur',
    'Address saved. Ready to place your order?',
    [],
    jid,
    'Tester',
    '000000000000003',
    null
  );
  assert.strictEqual(res.cart.deliveryAddress, 'House 12, Test Street, Model Town, Jaipur');

  customerCarts.delete(jid);
});

// Test 24: the safety net only ever touches products the customer named.
// "just 2 maggi total" must not match "Lifebuoy *Total* 10 Soap".
ok('Test 24: the safety net ignores products the customer never named', () => {
  const jid = JID('reconcile-brand');
  const res = reconcileMissedActions('add 2 maggi, that is the total', 'Adding 2 Maggi.', [], jid, 'T', '0', null);
  assert.strictEqual(res.cart.items.length, 1, 'only Maggi may be added');
  assert.ok(/maggi/i.test(res.cart.items[0].name));
  assert.strictEqual(res.cart.totalAmount, res.cart.items[0].price * 2);
  customerCarts.delete(jid);

  // "You're all set" is not an action claim.
  assert.strictEqual(
    reconcileMissedActions('just 2 maggi total', "You're all set with 2 Maggi.", [], JID('reconcile-set'), 'T', '0', null),
    null
  );
});

ok('Test 25: mentionsProduct requires the brand token', () => {
  const soap = {
    name: 'Lifebuoy Total 10 Germ Protection Soap (125g)',
    keywords: ['lifebuoy total 10 germ protection soap (125g)', 'lifebuoy', 'soap'],
  };
  assert.strictEqual(mentionsProduct('add 2 lifebuoy soap', soap), true);
  assert.strictEqual(mentionsProduct('just 2 maggi total, remove nothing', soap), false);
});

console.log(`\n✓✓ ALL ${passed} TRIGGER GATE TESTS PASSED`);