import assert from 'assert';

console.log('--- RUNNING LOCAL SLM FALLBACK TESTS ---');

// The bot's last-resort local SLM. It used to default to
// 'http://127.0.0.1:8080/v1/chat/completions' whenever LLM_BASE_URL was unset, so
// a box with no local model paid the full 8s abort on every message that Groq and
// OpenRouter had already failed — and then replied nothing anyway.
const { callLocalSlm } = await import('./localSlm.js');

const calls = [];
const realFetch = globalThis.fetch;
const ok = (content) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), body: JSON.parse(opts.body) });
  if (String(url).includes(':9')) throw new Error('ECONNREFUSED');
  return ok('  hello from local  ');
};

const messages = [{ role: 'user', content: 'hi' }];

try {
  // ── Test 1: unconfigured means unattempted ────────────────────────────────
  console.log('\nTest 1: no local server configured → no attempt, no hang');
  delete process.env.LLM_BASE_URL;
  calls.length = 0;
  const t0 = Date.now();
  const out = await callLocalSlm(messages);
  const elapsed = Date.now() - t0;
  assert.strictEqual(out, null, 'no configured local model → no reply');
  assert.deepStrictEqual(calls, [], 'nothing may be dialled when no local model is configured');
  assert.ok(elapsed < 1000, `must not sit on the timeout (took ${elapsed}ms)`);

  // ── Test 2: a configured server is used, and the reply is trimmed ──────────
  console.log('\nTest 2: a configured local server is used');
  process.env.LLM_BASE_URL = 'http://127.0.0.1:8080/v1/chat/completions';
  calls.length = 0;
  assert.strictEqual(await callLocalSlm(messages), 'hello from local');
  assert.strictEqual(calls.length, 1, 'exactly one attempt');
  assert.strictEqual(calls[0].url, process.env.LLM_BASE_URL);
  assert.deepStrictEqual(calls[0].body.messages, messages, 'the conversation is forwarded');

  // ── Test 3: a refused connection fails fast ───────────────────────────────
  console.log('\nTest 3: an unreachable configured server is a fast null, not an 8s wait');
  process.env.LLM_BASE_URL = 'http://127.0.0.1:9/v1/chat/completions';
  const t1 = Date.now();
  assert.strictEqual(await callLocalSlm(messages), null);
  assert.ok(Date.now() - t1 < 1000, 'a refused connection must fail fast');

  // ── Test 4: a blank completion is not a reply ─────────────────────────────
  console.log('\nTest 4: whitespace is not a reply');
  process.env.LLM_BASE_URL = 'http://127.0.0.1:8080/v1/chat/completions';
  globalThis.fetch = async () => ok('   ');
  assert.strictEqual(await callLocalSlm(messages), null, 'a blank completion is not a reply');

  console.log('\n========================================');
  console.log('🎉 ALL LOCAL SLM FALLBACK TESTS PASSED 🎉');
  console.log('========================================');
} finally {
  globalThis.fetch = realFetch;
}
