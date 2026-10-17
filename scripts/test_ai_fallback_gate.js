import assert from 'assert';

console.log('--- RUNNING AI FALLBACK GATE TESTS ---');

// Two shipped bugs are guarded here:
//   * the client used to dial OpenRouter directly with a key injected at build
//     time — the live key ended up in the public bundle. The client must now
//     dial the bot's own proxy, which holds the key server-side;
//   * the local-SLM fallback used to fall through to a hardcoded
//     'http://127.0.0.1:8080/v1/chat/completions'. With no local model running,
//     every production browser dialled its OWN loopback, hung for the full 10 s
//     timeout, then threw, and Vite baked that literal into the bundle.
process.env.OPENROUTER_API_KEY = '';
process.env.LLM_BASE_URL = '';
delete process.env.VITE_LLM_BASE_URL;

const { callOpenRouter, AI_CHAT_ENDPOINT } = await import('../src/utils/openrouterClient.ts');

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  calls.push(String(url));
  throw new Error('network disabled in test');
};

try {
  // ── Test 1: no local URL → only the bot proxy is dialled ───────────────────
  console.log('\nTest 1: no local URL → only the bot proxy is dialled, never a loopback');
  let threw = null;
  try {
    await callOpenRouter({ prompt: 'hello' });
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'callOpenRouter must reject when every path is unavailable');
  assert.deepStrictEqual(
    calls,
    [AI_CHAT_ENDPOINT],
    'the only call the client may make is to the bot proxy'
  );
  assert.ok(
    !calls.some((u) => u.includes('127.0.0.1')),
    'nothing may dial a hardcoded loopback when no local server is configured'
  );
  assert.ok(
    !String(threw.message).includes('127.0.0.1'),
    'the failure must not be about an unconfigured local hop'
  );

  // ── Test 2: a configured local URL is still tried ──────────────────────────
  console.log('\nTest 2: a configured local URL is still attempted');
  process.env.LLM_BASE_URL = 'http://127.0.0.1:9/v1/chat/completions';
  calls.length = 0;
  try {
    await callOpenRouter({ prompt: 'hello' });
  } catch {
    /* expected: the configured server is down */
  }
  assert.deepStrictEqual(
    calls,
    [AI_CHAT_ENDPOINT, 'http://127.0.0.1:9/v1/chat/completions'],
    'an explicitly configured local server must still be used as the fallback'
  );

  console.log('\n========================================');
  console.log('🎉 ALL AI FALLBACK GATE TESTS PASSED 🎉');
  console.log('========================================');
} finally {
  globalThis.fetch = realFetch;
}
