// Guards the message templates themselves.
//
// The other suites assert behaviour with the picker pinned to the first variant.
// This one is about the 177 strings behind that: every variant has to be usable,
// on-brand, and free of the things the product owner explicitly banned (em dashes,
// emoji spam, machine-sounding copy).
import assert from 'assert';
import {
  MESSAGE_TEMPLATES,
  MESSAGE_FAMILIES,
  setMessageRandom,
  resetMessageRandom,
  fillTemplate,
  pickTemplate,
  isFromFamily,
  welcomeMessage,
  outOfRangeMessage,
  storeMatchedMessage,
  itemUnavailableMessage,
  orderConfirmationMessage,
  rejectedMessage,
} from './messages.js';

console.log('--- RUNNING MESSAGE TEMPLATE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// Which placeholders each family is allowed to use, and which it must use.
const ALLOWED = {
  welcome: [],
  locationHowto: [],
  storeUnreachable: [],
  noItemsListed: [],
  noStoreConnected: [],
  outOfRange: ['km'],
  noStoreServing: [],
  storeMatched: ['area', 'store', 'distance'],
  itemUnavailable: ['items'],
  itemAmbiguous: ['options'],
  orderConfirmation: ['id', 'items', 'total', 'address'],
  accepted: ['id', 'total'],
  atPickup: ['id', 'total'],
  delivered: ['id', 'total'],
  rejected: ['id', 'reason'],
};

// ── 1: every family is populated ─────────────────────────────────────────────
assert.ok(MESSAGE_FAMILIES.length >= 13, `expected at least 13 families, found ${MESSAGE_FAMILIES.length}`);
for (const family of MESSAGE_FAMILIES) {
  const list = MESSAGE_TEMPLATES[family];
  assert.ok(Array.isArray(list), `${family} must be an array`);
  assert.ok(list.length >= 10, `${family} needs at least 10 variants, has ${list.length}`);
  assert.ok(list.length <= 15, `${family} should not exceed 15 variants, has ${list.length}`);
}
ok(`${MESSAGE_FAMILIES.length} families, 10 to 15 variants each`);

// ── 2: no em dashes or en dashes, the owner's explicit rule ─────────────────
for (const family of MESSAGE_FAMILIES) {
  for (const [i, text] of MESSAGE_TEMPLATES[family].entries()) {
    assert.ok(!/[\u2013\u2014]/.test(text), `${family}[${i}] contains a dash character`);
    assert.ok(!/\s-\s/.test(text), `${family}[${i}] uses a spaced hyphen as a dash`);
  }
}
ok('no em dashes or en dashes anywhere in the copy');

// ── 3: no duplicate wording inside a family ─────────────────────────────────
for (const family of MESSAGE_FAMILIES) {
  const list = MESSAGE_TEMPLATES[family];
  assert.strictEqual(new Set(list).size, list.length, `${family} has duplicate variants`);
}
ok('no duplicate variants within a family');

// ── 4: every variant is a real message, not a stub ──────────────────────────
for (const family of MESSAGE_FAMILIES) {
  for (const [i, text] of MESSAGE_TEMPLATES[family].entries()) {
    const t = text.trim();
    assert.ok(t.length >= 30, `${family}[${i}] is too short to be a real message`);
    // A message ends in punctuation, a line break, or (allowed) one emoji.
    assert.ok(
      /[.!?₹]$/.test(t) || /\n/.test(t) || /\p{Extended_Pictographic}$/u.test(t),
      `${family}[${i}] does not end like a message`
    );
  }
}
ok('every variant is a complete message, not a fragment');

// ── 5: placeholders are known, and the required ones are present ────────────
for (const family of MESSAGE_FAMILIES) {
  const allowed = new Set(ALLOWED[family] || []);
  const seen = new Set();
  for (const [i, text] of MESSAGE_TEMPLATES[family].entries()) {
    for (const m of text.matchAll(/\{(\w+)\}/g)) {
      const key = m[1];
      assert.ok(allowed.has(key), `${family}[${i}] uses unknown placeholder {${key}}`);
      seen.add(key);
    }
  }
  for (const required of allowed) {
    assert.ok(seen.has(required), `${family} never uses its placeholder {${required}}`);
  }
}
ok('placeholders are declared per family and all are used');

// ── 6: the invariants the code and tests depend on ──────────────────────────
for (const [i, text] of MESSAGE_TEMPLATES.storeMatched.entries()) {
  assert.ok(/connected to/i.test(text), `storeMatched[${i}] must say "connected to"`);
  assert.ok(text.includes('{store}'), `storeMatched[${i}] must name the store`);
}
ok('every store-matched reply names the store and says "connected to"');

for (const [i, text] of MESSAGE_TEMPLATES.itemUnavailable.entries()) {
  assert.ok(text.includes('{items}'), `itemUnavailable[${i}] must name the missing items`);
}
ok('every unavailable-item reply names what it could not add');

for (const [i, text] of MESSAGE_TEMPLATES.orderConfirmation.entries()) {
  for (const token of ['#{id}', '{items}', '₹{total}', '{address}']) {
    assert.ok(text.includes(token), `orderConfirmation[${i}] is missing ${token}`);
  }
}
ok('every confirmation carries the id, items, total and address');

// ── 7: no emoji spam, one emoji at most ──────────────────────────────────────
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu;
for (const family of MESSAGE_FAMILIES) {
  for (const [i, text] of MESSAGE_TEMPLATES[family].entries()) {
    const found = text.match(EMOJI) || [];
    assert.ok(found.length <= 1, `${family}[${i}] has ${found.length} emoji, at most 1 is allowed`);
  }
}
ok('no variant carries more than one emoji');

// ── 8: the picker actually picks at random ──────────────────────────────────
setMessageRandom(() => 0);
const first = welcomeMessage();
assert.strictEqual(first, fillTemplate(MESSAGE_TEMPLATES.welcome[0]), 'a pinned 0 must give the first variant');

setMessageRandom(() => 0.999);
const last = welcomeMessage();
assert.strictEqual(last, fillTemplate(MESSAGE_TEMPLATES.welcome.at(-1)), 'a pinned 0.999 must give the last variant');
assert.notStrictEqual(first, last, 'the picker must be able to change the wording');

// and across many draws, more than one phrasing appears
resetMessageRandom();
const draws = new Set(Array.from({ length: 200 }, () => welcomeMessage()));
assert.ok(draws.size > 1, `200 random draws produced only ${draws.size} phrasing`);
ok('the picker randomises, and can be pinned for tests');

// ── 9: the named builders fill their placeholders correctly ─────────────────
setMessageRandom(() => 0);
assert.ok(/3\.4 km/.test(outOfRangeMessage(3.4)), 'out-of-range carries the distance');
assert.ok(!outOfRangeMessage(3.4).includes('{km}'), 'no unfilled placeholder survives');

const matched = storeMatchedMessage('Model Town', 'Gupta Kirana', ' (1.2 km away)');
assert.ok(matched.includes('Model Town') && matched.includes('Gupta Kirana') && matched.includes('1.2 km'));
assert.ok(!/\{/.test(matched), 'no unfilled placeholder survives the store reply');

const unavailable = itemUnavailableMessage(['Coca-Cola', 'Lays']);
assert.ok(unavailable.includes('Coca-Cola') && unavailable.includes('Lays'));

const confirmation = orderConfirmationMessage({
  id: 'DKN-1',
  items: [{ quantity: 2, name: 'Maggi', price: 14, total: 28 }],
  totalAmount: 28,
  deliveryAddress: 'House 12, Jaipur',
});
assert.ok(confirmation.includes('#DKN-1') && confirmation.includes('₹28') && confirmation.includes('House 12'));
assert.ok(confirmation.includes('2x Maggi'), 'the item line is built from the order');
assert.strictEqual(orderConfirmationMessage(null), '', 'no order means no confirmation');

const declined = rejectedMessage({ id: 'DKN-2', totalAmount: 40 }, 'out of stock');
assert.ok(declined.includes('#DKN-2') && declined.includes('out of stock'));
assert.strictEqual(
  rejectedMessage({ id: 'DKN-3' }, ''),
  fillTemplate(MESSAGE_TEMPLATES.rejected[0], { id: 'DKN-3', reason: 'item temporarily unavailable' }),
  'a missing reason falls back to the standard wording'
);
ok('the named builders fill every placeholder, including the fallbacks');

// ── 10: isFromFamily recognises its own output ──────────────────────────────
assert.ok(isFromFamily('welcome', first), 'a real welcome reply must be recognised');
assert.ok(!isFromFamily('welcome', 'Order #DKN-1 placed'), 'an unrelated reply must not match');
ok('isFromFamily identifies family members and rejects strangers');

resetMessageRandom();
console.log('\n========================================');
console.log(`🎉 ALL ${n} MESSAGE TEMPLATE TESTS PASSED 🎉`);
console.log('========================================');
