// The reported bug, as a test.
//
// A customer asked for soap and the bot offered "Lifeboy soap — ₹30", then denied
// it in the next breath. The cause was two sources: the prompt showed the model
// the GLOBAL catalog (which stocks Lifeboy soap), while the gate priced from the
// MATCHED SHOP's catalog (which does not). The offer itself carried no action tag,
// so the gate never saw it and nothing corrected it.
//
// These tests pin the invariant: one source — the served shop's catalog — for the
// prompt, and a correction for any un-tagged claim about an item the shop does not
// stock.
import './test_setup_orders_file.js';
import assert from 'assert';
import { dukanCatalog } from './dukanCatalog.js';

// Pin the phrasing picker: the reply wording is asserted below.
// Randomisation itself is covered by test_messages.js.
const { setMessageRandom } = await import('./messages.js');
setMessageRandom(() => 0);

const bot = await import('./dukanBot.js');

console.log('--- RUNNING PROMPT SCOPE TESTS (T9) ---');

const SHOP_CATALOG = [
  { id: 'k1', name: 'Maggi 2-Minute Noodles (70g)', category: 'Snacks', price: 15, unit: 'pack', inStock: true, keywords: ['maggi', 'noodles'] },
  { id: 'k2', name: 'Tata Salt Vaccum Evaporated (1kg)', category: 'Staples', price: 28, unit: 'pack', inStock: true, keywords: ['salt', 'tata'] },
];

// The global catalog is the merchant's/developer's own list. It holds items this
// shop does not stock, including the exact one from the bug report. A prompt or a
// correction that reads from here is the bug.
dukanCatalog.addProduct({ name: 'Lifeboy soap', price: 30, unit: 'bar' });
const GLOBAL_ONLY = 'Lifeboy soap';
const lifeboy = dukanCatalog.getAll().find((p) => p.name === GLOBAL_ONLY);

// ── 1: the prompt carries the shop's list and nothing else ───────────────────
const prompt = bot.buildDynamicSystemPrompt('Cust', null, SHOP_CATALOG, 'I need soap');
for (const p of SHOP_CATALOG) {
  assert.ok(prompt.includes(p.name), `the prompt must carry the shop's own item "${p.name}"`);
}
assert.ok(!prompt.includes(GLOBAL_ONLY), 'the prompt must not contain an item this shop does not stock');
assert.ok(/STORE CATALOG/i.test(prompt), 'the prompt must label the authoritative list');
assert.ok(
  /(does not (have|stock)|not (listed|available))/i.test(prompt),
  'the prompt must tell the model what to do with an unlisted item'
);
console.log("✓ 1: the prompt is built from the shop's catalog only");

// ── 2: no shop ⇒ no inventory at all ─────────────────────────────────────────
const empty = bot.buildDynamicSystemPrompt('Cust', null, [], 'soap');
assert.ok(/no store is connected/i.test(empty), 'without a shop the prompt says so');
assert.ok(!empty.includes(GLOBAL_ONLY), 'without a shop no global item may be named');
assert.ok(!/Maggi|Amul|Parle/i.test(empty), 'without a shop no brand names may be planted in the prompt');
console.log('✓ 2: with no connected shop the prompt names no items');

// ── 3: the engine's catalog source is the served shop ────────────────────────
const jid = 'scope@s.whatsapp.net';
assert.ok(
  dukanCatalog.search('soap').length > 0,
  'precondition: the global catalog DOES match "soap" (that is what used to leak)'
);
assert.deepStrictEqual(bot.catalogForCustomer(jid), [], 'no shop connected → no catalog for the prompt');
bot.activeShops.set(jid, { userId: 'shop-1', shopName: 'Scope Shop', catalog: SHOP_CATALOG });
assert.deepStrictEqual(
  bot.catalogForCustomer(jid),
  SHOP_CATALOG,
  "the served shop's catalog is the only source the prompt may use"
);
console.log("✓ 3: catalogForCustomer returns the served shop's catalog, never the global one");

// ── 4: end-to-end — the prompt actually sent to the model ───────────────────
// The model is stubbed to answer with the exact hallucinated offer from the bug.
let capturedPrompt = null;
const realFetch = globalThis.fetch;
process.env.GROQ_API_KEY = 'test-groq-key';
globalThis.fetch = async (url, init) => {
  if (/chat\/completions/.test(String(url))) {
    capturedPrompt = JSON.parse(init?.body || '{}').messages?.[0]?.content || '';
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'I have *Lifeboy soap* in stock at ₹30. Would you like to add it to your cart?' } }],
      }),
    };
  }
  throw new Error(`unexpected network call in a test: ${url}`);
};

let reply;
try {
  const result = await bot.dukanBot.handleMessage(
    { remoteJid: jid, text: 'I need soap', pushName: 'Cust', from: '919588834592' },
    null,
    null
  );
  reply = result?.reply || '';
} finally {
  globalThis.fetch = realFetch;
  delete process.env.GROQ_API_KEY;
}

assert.ok(capturedPrompt, 'the model must have been called with a system prompt');
assert.ok(!capturedPrompt.includes(GLOBAL_ONLY), `the sent prompt leaked "${GLOBAL_ONLY}"`);
assert.ok(capturedPrompt.includes(SHOP_CATALOG[0].name), "the sent prompt must carry the shop's own items");
assert.ok(/does not have|not available/i.test(reply), 'the customer is told the item is not available');
assert.ok(!/in stock/i.test(reply), 'the reply must not still claim the item is in stock');
assert.ok(!/₹\s*30/.test(reply), 'the reply must not repeat the invented price');
console.log('✓ 4: the sent prompt is shop-scoped and the un-tagged offer is corrected');

// ── 5: the un-tagged mention guard, and its false-positive guard ────────────
const flagged = bot.unstockedMentions('I have Lifeboy soap in stock at ₹30.', SHOP_CATALOG);
assert.strictEqual(flagged.length, 1, 'a claim about a global-only item is flagged');
assert.strictEqual(flagged[0].name, GLOBAL_ONLY);

const notFlagged = bot.unstockedMentions('Adding Maggi 2-Minute Noodles to your cart.', SHOP_CATALOG);
assert.deepStrictEqual(
  notFlagged,
  [],
  'a stocked item must never be flagged because a longer global name contains it'
);
assert.deepStrictEqual(
  bot.unstockedMentions('I have Lifeboy soap in stock.', []),
  [],
  'with no shop connected there is no stock list to contradict'
);
console.log('✓ 5: un-tagged claims are flagged, stocked items are not');

// ── 6: the corrected reply drops the claim and says why ─────────────────────
const corrected = bot.composeGatedNarrative(
  'I have *Lifeboy soap* in stock at ₹30. Would you like to add it to your cart?',
  { unstocked: [lifeboy], catalog: SHOP_CATALOG }
);
assert.ok(/does not have/i.test(corrected), 'the customer is told the shop does not have it');
assert.ok(!/would you like to add/i.test(corrected), 'the offer is gone');
console.log('✓ 6: the reply is rebuilt from the real stock list');

// ── 7: a correct sentence about a STOCKED item survives the correction ──────
// Dropping the claim is not a licence to drop the rest: "we have Tata Salt,
// would you like to add it?" is a true offer and must reach the customer.
const crossSell = bot.composeGatedNarrative(
  'We do not have Colgate. We have Tata Salt, would you like to add it?',
  { unstocked: [{ name: 'Colgate' }], catalog: SHOP_CATALOG }
);
assert.ok(/tata salt/i.test(crossSell), 'the offer of a stocked item survives');
assert.ok(/does not have: Colgate/i.test(crossSell), 'the missing item is still named');
console.log('✓ 7: a sentence about a stocked item is never dropped with the claim');

console.log('\n========================================');
console.log('🎉 ALL 7 PROMPT SCOPE TESTS PASSED 🎉');
console.log('========================================');
