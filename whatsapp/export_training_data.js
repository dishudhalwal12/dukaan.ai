#!/usr/bin/env node
/**
 * TRAINING DATA EXPORT — turn the WhatsApp ledger into clean JSONL.
 *
 * The bot keeps every turn in whatsapp/store/messages.json. This pulls out the
 * customer -> bot exchanges in the OpenAI chat format, so the file can be fed
 * straight to a fine-tune.
 *
 * Provenance is the point. A message sent with fromMe=true is either the bot or
 * the shopkeeper typing by hand, and training on the shopkeeper's own replies
 * teaches the model the wrong voice. Records written after provenance landed
 * carry an explicit `source` ('customer' | 'bot' | 'human'), so those pairs
 * export as `tagged`. Older records carry no such field, and a bot reply there is
 * genuinely indistinguishable from the shopkeeper's, so they are skipped and
 * counted rather than guessed at.
 *
 *   node export_training_data.js                     -> JSONL on stdout
 *   node export_training_data.js --out train.jsonl   -> write a file instead
 *   node export_training_data.js --include-groups    -> count groups as customers
 *   node export_training_data.js --assume-fromMe-is-bot
 *                                                    -> gamble on the old records
 *   node export_training_data.js --self-test         -> prove the extraction
 *
 * Stats go to stderr, so `... > train.jsonl` stays pure data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── the extraction (pure, so --self-test can call it) ───────────────────────

/** The store is {jid: {index: message}}; flatten it to a time-ordered list. */
export function flatten(store) {
  const out = [];
  for (const [jid, chat] of Object.entries(store || {})) {
    const list = Array.isArray(chat) ? chat : Object.values(chat || {});
    for (const m of list) if (m && typeof m === 'object') out.push({ ...m, jid: m.remoteJid || jid });
  }
  return out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Who wrote this turn: 'customer', 'bot', 'human', or 'unknown'.
 *
 * 'unknown' is an old record with no `source`. Nothing here guesses: fromMe only
 * becomes meaningful when the caller opts in, because a hand-typed shopkeeper
 * reply is exactly as fromMe as the bot's.
 */
function roleOf(m, assumeFromMe) {
  if (m.source === 'customer' || m.source === 'bot' || m.source === 'human') return m.source;
  if (!assumeFromMe) return 'unknown';
  return m.fromMe ? 'bot' : 'customer';
}

const clean = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

/**
 * Walk each chat and pair a customer turn with the bot turn that answered it.
 * Returns {pairs, stats}. A pair is OpenAI chat format plus its provenance.
 */
export function extractPairs(store, {
  includeGroups = false,
  assumeFromMe = false,
  minChars = 2,
  windowMs = 30 * 60 * 1000,
} = {}) {
  const stats = { records: 0, groupsSkipped: 0, unknown: 0, noReply: 0, empty: 0, pairs: 0 };
  const byChat = new Map();
  for (const m of flatten(store)) {
    stats.records++;
    if (m.isGroup && !includeGroups) { stats.groupsSkipped++; continue; }
    if (!byChat.has(m.jid)) byChat.set(m.jid, []);
    byChat.get(m.jid).push(m);
  }

  const pairs = [];
  for (const [jid, msgs] of byChat) {
    for (let i = 0; i < msgs.length; i++) {
      const role = roleOf(msgs[i], assumeFromMe);
      if (role === 'unknown') { stats.unknown++; continue; }
      if (role !== 'customer') continue;

      const q = msgs[i];
      const question = clean(q.text);
      if (q.isVoiceNote || question.length < minChars) { stats.empty++; continue; }

      // The bot's answer is the next bot-authored turn, before the customer or
      // the shopkeeper speaks again, and within the 30-minute session window.
      let answer = null;
      for (let j = i + 1; j < msgs.length; j++) {
        const c = msgs[j];
        if ((c.timestamp || 0) - (q.timestamp || 0) > windowMs) break;
        const cRole = roleOf(c, assumeFromMe);
        if (cRole === 'customer' || cRole === 'human') break;
        if (cRole === 'bot') { answer = c; break; }
      }
      const text = answer ? clean(answer.text) : '';
      if (text.length < minChars) { stats.noReply++; continue; }

      stats.pairs++;
      pairs.push({
        messages: [{ role: 'user', content: question }, { role: 'assistant', content: text }],
        // 'tagged' means both halves came from an explicit source field.
        provenance: answer.source === 'bot' && q.source === 'customer' ? 'tagged' : 'legacy',
        chat: jid,
        at: new Date(q.timestamp || 0).toISOString(),
      });
    }
  }
  return { pairs, stats };
}

// ─── self-test: one runnable check, no framework ─────────────────────────────
if (process.argv.includes('--self-test')) {
  const fixture = {
    'tagged@s.whatsapp.net': {
      0: { source: 'customer', fromMe: false, text: '2 maggi bhej do', timestamp: 1000 },
      1: { source: 'bot', fromMe: true, text: 'Adding 2 Maggi to your cart.', timestamp: 1500 },
      2: { source: 'human', fromMe: true, text: 'bhai stock aa gaya', timestamp: 2000 },
      3: { source: 'customer', fromMe: false, text: 'ok', timestamp: 2500 },
    },
    'legacy@s.whatsapp.net': {
      0: { fromMe: false, text: 'doodh hai?', timestamp: 3000 },
      1: { fromMe: true, text: 'Haan, Amul Taaza Milk available hai.', timestamp: 3500 },
    },
    'g@g.us': {
      0: { source: 'customer', fromMe: false, isGroup: true, text: 'hello group', timestamp: 4000 },
      1: { source: 'bot', fromMe: true, isGroup: true, text: 'group reply here', timestamp: 4100 },
    },
  };
  const assert = (await import('assert')).default;

  // Default: only the provenance-tagged exchange is trustworthy.
  const all = extractPairs(fixture);
  assert.strictEqual(all.pairs.length, 1, `expected 1 trustworthy pair, got ${all.pairs.length}`);
  assert.strictEqual(all.pairs[0].provenance, 'tagged', 'a source-tagged pair must be tagged');
  assert.strictEqual(all.pairs[0].messages[0].role, 'user', 'first turn must be the customer');
  assert.strictEqual(all.pairs[0].messages[1].role, 'assistant', 'second turn must be the bot');
  assert.strictEqual(all.stats.unknown, 2, `the 2 untagged records must be counted, not guessed (got ${all.stats.unknown})`);

  // The shopkeeper's own line must never be taken as a bot answer.
  assert.ok(!all.pairs.some((p) => p.messages[1].content.includes('stock aa gaya')), 'a human reply leaked into the training data');

  // Opting in recovers the old record, and labels it legacy.
  const legacy = extractPairs(fixture, { assumeFromMe: true });
  assert.strictEqual(legacy.pairs.length, 2, `--assume-fromMe-is-bot must recover the old pair (got ${legacy.pairs.length})`);
  assert.strictEqual(legacy.pairs.filter((p) => p.provenance === 'legacy').length, 1, 'the recovered pair must be labelled legacy');

  // Groups stay opt-in.
  const withGroups = extractPairs(fixture, { includeGroups: true });
  assert.strictEqual(withGroups.pairs.length, 2, `groups must be opt-in (got ${withGroups.pairs.length})`);

  console.log('✓ self-test: pairs, provenance, human-reply exclusion and every flag behave');
  process.exit(0);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const inFile = arg('--in', path.join(__dirname, 'store', 'messages.json'));
const outFile = arg('--out', '');

if (!fs.existsSync(inFile)) {
  console.error(`No message store at ${inFile}. Pass --in <path>, or run this on the laptop that holds the live ledger.`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const { pairs, stats } = extractPairs(store, {
  includeGroups: process.argv.includes('--include-groups'),
  assumeFromMe: process.argv.includes('--assume-fromMe-is-bot'),
});

const jsonl = pairs.map((p) => JSON.stringify({ messages: p.messages })).join('\n') + (pairs.length ? '\n' : '');
if (outFile) fs.writeFileSync(outFile, jsonl);
else process.stdout.write(jsonl);

const tagged = pairs.filter((p) => p.provenance === 'tagged').length;
console.error(
  [
    `source:      ${inFile}`,
    `records:     ${stats.records} (${stats.groupsSkipped} group records skipped)`,
    `pairs:       ${pairs.length}  (${tagged} tagged, ${pairs.length - tagged} legacy)`,
    `skipped:     ${stats.noReply} unanswered, ${stats.empty} empty/voice, ${stats.unknown} with no provenance`,
    outFile ? `written:     ${outFile}` : 'written:     stdout',
  ].join('\n')
);
