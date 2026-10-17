import assert from 'assert';

console.log('--- RUNNING AI FALLBACK GATE TESTS ---');

// The local-SLM fallback in openrouterClient must fire ONLY when a local model
// server is actually configured. It used to fall through to a hardcoded
// 'http://127.0.0.1:8080/v1/chat/completions': with no local model running, every
// production browser dialled its OWN loopback, hung for the full 10s timeout, then
// threw. Vite also baked that literal into the shipped bundle.
process.env.OPENROUTER_API_KEY = '';
process.env.LLM_BASE_URL = '';
delete process.env.VITE_LLM_BASE_URL;

const { callOpenRouter, resolveOpenRouterKeys } = await import('../src/utils/openrouterClient.ts');

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  calls.push(String(url));
  throw new Error('network disabled in test');
};

try {
  // ── Test 1: nothing configured → nothing dialled ───────────────────────────
  console.log('\nTest 1: no keys and no local URL → no local fallback attempt');
  assert.deepStrictEqual(resolveOpenRouterKeys(), [], 'this test must run with zero OpenRouter keys');

  let threw = null;
  try {
    await callOpenRouter({ prompt: 'hello' });
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'callOpenRouter must reject when every path is unavailable');
  assert.deepStrictEqual(calls, [], 'nothing may be dialled when no local server is configured');
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
    ['http://127.0.0.1:9/v1/chat/completions'],
    'an explicitly configured local server must still be used'
  );

  console.log('\n========================================');
  console.log('🎉 ALL AI FALLBACK GATE TESTS PASSED 🎉');
  console.log('========================================');
} finally {
  globalThis.fetch = realFetch;
}
