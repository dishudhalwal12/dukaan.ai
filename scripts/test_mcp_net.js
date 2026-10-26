import assert from 'assert';
import { createResilientFetch, createSupabaseFetch, isSocketError } from '../mcp/net.js';

/**
 * In production, `quote_order` and `place_order` failed with
 * "ECONNRESET: The socket connection was closed unexpectedly" and succeeded on
 * an immediate manual retry. A warm Vercel instance keeps Supabase's pooled
 * keep-alive sockets; after an idle gap (the customer typing) the pooled socket
 * is dead, and the next POST is the one that discovers it.
 *
 * The wrapper retries ONCE and only for socket-level failures. HTTP errors are
 * answers, not transport failures, so they are never retried; neither is a
 * programming error, which a retry would only delay.
 */
console.log('--- RUNNING MCP NETWORK RESILIENCE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const socketError = (code = 'ECONNRESET') => Object.assign(new Error(`${code}: socket closed`), { code });

assert.strictEqual(isSocketError(socketError('ECONNRESET')), true);
assert.strictEqual(isSocketError(socketError('UND_ERR_SOCKET')), true);
assert.strictEqual(isSocketError(new TypeError('fetch failed')), false);
assert.strictEqual(isSocketError(undefined), false);
ok('socket failures are recognised, programming errors are not');

// ── 1. One dead socket, one retry ───────────────────────────────────────────
{
  let calls = 0;
  const retries = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw socketError();
    return new Response('{}', { status: 200 });
  };
  const response = await createResilientFetch({ fetchImpl, onRetry: (count) => retries.push(count) })('https://example.test/rest/v1/x');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls, 2, 'exactly one retry');
  assert.deepStrictEqual(retries, [1], 'the retry is reported so it can be logged');
  ok('a stale socket is retried once and the retry is reported');
}

// ── 2. A persistent failure is not retried forever ─────────────────────────
{
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw socketError('ETIMEDOUT');
  };
  await assert.rejects(
    () => createResilientFetch({ fetchImpl, retries: 1 })('https://example.test/rest/v1/x'),
    /ETIMEDOUT/
  );
  assert.strictEqual(calls, 2, 'retries + 1 attempts, then the last error surfaces');
  ok('a persistent socket failure surfaces after one retry');
}

// ── 3. An HTTP error is an answer, not a transport failure ─────────────────
{
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('bad request', { status: 400 });
  };
  const response = await createResilientFetch({ fetchImpl })('https://example.test/rest/v1/x');
  assert.strictEqual(response.status, 400);
  assert.strictEqual(calls, 1, 'a 400 is returned to the caller, never retried');
  ok('an HTTP error is returned without a retry');
}

// ── 4. Programming errors are not hidden behind a retry ────────────────────
{
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new TypeError('invalid init');
  };
  await assert.rejects(() => createResilientFetch({ fetchImpl })('https://example.test/x'), /invalid init/);
  assert.strictEqual(calls, 1);
  ok('a non-socket error is not retried');
}

// ── 5. Supabase clients get this wrapper, not raw fetch ────────────────────
{
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw socketError();
    return new Response('{}', { status: 200 });
  };
  const wrapped = createSupabaseFetch({ fetchImpl });
  const response = await wrapped('https://example.test/auth/v1/user');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls, 2);
  ok('the Supabase client fetch is the resilient one');
}

console.log(`\nAll ${n} network resilience checks passed.`);
