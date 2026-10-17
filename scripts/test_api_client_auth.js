import assert from 'assert';
import { resolveApiUrl, buildAuthHeaders, parseSseBuffer } from '../src/services/apiClient.ts';

console.log('--- RUNNING CLIENT API TRANSPORT TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ── resolveApiUrl ────────────────────────────────────────────────────────────
assert.strictEqual(
  resolveApiUrl('https://aurelio-chasmy-dorsiventrally.ngrok-free.dev', '/api/status', null),
  'https://aurelio-chasmy-dorsiventrally.ngrok-free.dev/api/status'
);
assert.strictEqual(
  resolveApiUrl('https://back.example/', '/api/status', null),
  'https://back.example/api/status',
  'a trailing slash on the base must not double up'
);
ok('VITE_API_BASE, when set, makes the app call the backend origin directly');

assert.strictEqual(
  resolveApiUrl('', '/api/status', { hostname: 'localhost', port: '3000' }),
  'http://localhost:5001/api/status',
  'dev server on :3000 talks to the bot on :5001'
);
assert.strictEqual(
  resolveApiUrl(undefined, '/api/status', { hostname: 'localhost', port: '5001' }),
  '/api/status',
  'when the page is already on the bot, the call stays same-origin'
);
assert.strictEqual(
  resolveApiUrl(undefined, '/api/status', { hostname: 'dukaan-ai-beta.vercel.app', port: '' }),
  '/api/status',
  'with no base configured the call is same-origin (the old proxied behaviour)'
);
assert.strictEqual(
  resolveApiUrl(undefined, '/api/status', null),
  '/api/status',
  'no window (a non-browser runtime) still yields a usable path'
);
ok('with no base configured, the call resolves same-origin and local dev still works');

// ── buildAuthHeaders ─────────────────────────────────────────────────────────
{
  const h = buildAuthHeaders('tok-123');
  assert.strictEqual(h.Authorization, 'Bearer tok-123');
  assert.strictEqual(h['ngrok-skip-browser-warning'], '1');
  ok('every call carries the Supabase Bearer token and the ngrok bypass header');
}
{
  const h = buildAuthHeaders(null);
  assert.strictEqual(h.Authorization, undefined, 'no session means no Authorization header');
  assert.strictEqual(h['ngrok-skip-browser-warning'], '1');
  ok('with no session the header is omitted — the server, not the client, decides to refuse');
}
{
  const h = buildAuthHeaders('t', { 'Content-Type': 'application/json' });
  assert.strictEqual(h['Content-Type'], 'application/json');
  assert.strictEqual(h.Authorization, 'Bearer t');
  ok('extra headers merge without dropping the token');
}

// ── parseSseBuffer ───────────────────────────────────────────────────────────
{
  const r = parseSseBuffer('data: {"type":"status"}\n\n');
  assert.deepStrictEqual(r.messages, ['{"type":"status"}']);
  assert.strictEqual(r.rest, '');
  ok('a complete SSE frame parses into one message');
}
{
  const r = parseSseBuffer('data: a\n\ndata: b\n\n');
  assert.deepStrictEqual(r.messages, ['a', 'b']);
  ok('two frames in one chunk both parse');
}
{
  const r = parseSseBuffer('data: {"type":"or');
  assert.deepStrictEqual(r.messages, [], 'a half-received frame yields nothing yet');
  assert.strictEqual(r.rest, 'data: {"type":"or', 'the partial frame is kept for the next chunk');
  ok('a frame split across chunks is buffered, not dropped');
}
{
  const first = parseSseBuffer('data: {"id":1}\n\ndata: {"id"');
  assert.deepStrictEqual(first.messages, ['{"id":1}']);
  const second = parseSseBuffer(first.rest + ':2}\n\n');
  assert.deepStrictEqual(second.messages, ['{"id":2}']);
  ok('a split frame reassembles correctly across two reads');
}
{
  const r = parseSseBuffer(': ping\n\n');
  assert.deepStrictEqual(r.messages, [], 'the 25s heartbeat comment is not an event');
  ok('the heartbeat comment is ignored, not parsed as data');
}
{
  const r = parseSseBuffer('data: line1\ndata: line2\n\n');
  assert.deepStrictEqual(r.messages, ['line1\nline2'], 'multi-line data joins with a newline, per the SSE spec');
  ok('multi-line data frames join correctly');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} CLIENT API TRANSPORT TESTS PASSED 🎉`);
console.log('========================================');
