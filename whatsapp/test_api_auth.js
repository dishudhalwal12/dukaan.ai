import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import { createApiAuth } from './apiAuth.js';

console.log('--- RUNNING API AUTH TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ─── fakes ───────────────────────────────────────────────────────────────────
function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = {} } = handler(url, init) || {};
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

const supabaseOk = (userId) =>
  fakeFetch((url, init) => {
    assert.ok(String(url).endsWith('/auth/v1/user'), `unexpected verify URL: ${url}`);
    assert.ok(String(init.headers.Authorization).startsWith('Bearer '), 'the caller token is forwarded as a Bearer');
    assert.ok(init.headers.apikey, 'the project key is sent as apikey');
    return { status: 200, body: { id: userId } };
  });

function fakeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function fakeReq({ method = 'GET', url = '/api/dukan/orders', headers = {} } = {}) {
  return { method, originalUrl: url, headers };
}

function next() { next.called = true; }
const freshNext = () => { const f = () => { f.called = true; }; return f; };

// ─── 1. the policy table ─────────────────────────────────────────────────────
const policy = createApiAuth({
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-key',
  fetchImpl: supabaseOk('user-1'),
});

const P = (m, p) => policy.policyFor(m, p);
assert.strictEqual(P('GET', '/api/status'), 'public', 'health check stays reachable');
ok('GET /api/status is public — a health check that needs a login is not a health check');

assert.strictEqual(P('GET', '/api/dukan/orders'), 'auth');
ok('GET /api/dukan/orders needs a login');

assert.strictEqual(P('POST', '/api/dukan/orders/abc123/accept'), 'auth');
ok('accepting an order needs a login');

assert.strictEqual(P('GET', '/api/qr'), 'auth');
assert.strictEqual(P('POST', '/api/logout'), 'auth');
ok('WhatsApp linking routes need a login but stay usable by the shopkeeper POS');

assert.strictEqual(P('POST', '/api/send'), 'operator');
assert.strictEqual(P('GET', '/api/chats'), 'operator');
assert.strictEqual(P('GET', '/api/chats/9199@s.whatsapp.net/messages'), 'operator');
ok('sending as the shop and reading customer chats are operator-only');

assert.strictEqual(P('GET', '/api/webhook/logs'), 'operator');
assert.strictEqual(P('POST', '/api/dukan/ai-config'), 'operator');
assert.strictEqual(P('POST', '/api/dukan/ai-test'), 'operator');
ok('the webhook log and the runtime AI-key setter are operator-only');

assert.strictEqual(P('GET', '/api/anything-nobody-declared'), 'auth');
assert.strictEqual(P('DELETE', '/api/dukan/catalog/x'), 'auth');
ok('an undeclared route defaults to auth — the policy fails closed');

// ─── 2. the middleware ───────────────────────────────────────────────────────
{
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: supabaseOk('u') });
  const res = fakeRes();
  await a.run(fakeReq(), res, freshNext());
  assert.strictEqual(res.statusCode, 401, 'no token must be refused');
  assert.deepStrictEqual(res.body, { error: 'unauthorized' });
  ok('a request with no Authorization header is refused with 401');
}

{
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: supabaseOk('u') });
  const res = fakeRes();
  await a.run(fakeReq({ headers: { authorization: 'Token abc' } }), res, freshNext());
  assert.strictEqual(res.statusCode, 401);
  ok('a non-Bearer Authorization header is refused');
}

{
  const f = fakeFetch(() => ({ status: 401, body: {} }));
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: f });
  const res = fakeRes();
  await a.run(fakeReq({ headers: { authorization: 'Bearer bad' } }), res, freshNext());
  assert.strictEqual(res.statusCode, 401);
  ok('a token Supabase rejects is refused');
}

{
  const boom = async () => { throw new Error('offline'); };
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: boom });
  const res = fakeRes();
  await a.run(fakeReq({ headers: { authorization: 'Bearer x' } }), res, freshNext());
  assert.strictEqual(res.statusCode, 401);
  ok('a verification that cannot complete fails CLOSED, not open');
}

{
  const a = createApiAuth({ supabaseUrl: '', supabaseKey: '', fetchImpl: supabaseOk('u') });
  const res = fakeRes();
  await a.run(fakeReq({ headers: { authorization: 'Bearer x' } }), res, freshNext());
  assert.strictEqual(res.statusCode, 401);
  ok('an unconfigured Supabase refuses rather than opening the API');
}

{
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: supabaseOk('shopkeeper-1') });
  const req = fakeReq({ url: '/api/dukan/orders', headers: { authorization: 'Bearer good' } });
  const nx = freshNext();
  await a.run(req, fakeRes(), nx);
  assert.strictEqual(nx.called, true, 'a valid token proceeds');
  assert.strictEqual(req.auth.userId, 'shopkeeper-1');
  assert.strictEqual(req.auth.isOperator, false);
  ok('a valid token sets req.auth.userId from Supabase, not from the request body');
}

{
  const a = createApiAuth({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'k',
    fetchImpl: supabaseOk('shopkeeper-1'),
    operatorIds: new Set(['op-9']),
  });
  const res = fakeRes();
  await a.run(fakeReq({ method: 'GET', url: '/api/chats', headers: { authorization: 'Bearer good' } }), res, freshNext());
  assert.strictEqual(res.statusCode, 403, 'operator route refuses a plain shopkeeper');
  assert.deepStrictEqual(res.body, { error: 'forbidden' });
  ok('an operator-only route refuses a logged-in non-operator with 403');
}

{
  const a = createApiAuth({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'k',
    fetchImpl: supabaseOk('op-9'),
    operatorIds: new Set(['op-9']),
  });
  const req = fakeReq({ method: 'GET', url: '/api/chats', headers: { authorization: 'Bearer good' } });
  const nx = freshNext();
  await a.run(req, fakeRes(), nx);
  assert.strictEqual(nx.called, true);
  assert.strictEqual(req.auth.isOperator, true);
  ok('an operator is allowed through');
}

{
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: supabaseOk('u') });
  const nx = freshNext();
  const res = fakeRes();
  await a.run(fakeReq({ url: '/api/status' }), res, nx);
  assert.strictEqual(nx.called, true, 'a public route proceeds without a token');
  assert.strictEqual(res.statusCode, null, 'a public route is not refused');
  ok('the public route proceeds with no token at all');
}

// ─── 3. the cache ────────────────────────────────────────────────────────────
{
  const f = supabaseOk('user-7');
  const a = createApiAuth({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'k', fetchImpl: f });
  for (let i = 0; i < 5; i++) {
    await a.run(fakeReq({ url: '/api/dukan/orders', headers: { authorization: 'Bearer same-token' } }), fakeRes(), freshNext());
  }
  assert.strictEqual(f.calls.length, 1, 'a token verified once is not re-verified on every 2.5s poll');
  await a.run(fakeReq({ url: '/api/dukan/orders', headers: { authorization: 'Bearer other-token' } }), fakeRes(), freshNext());
  assert.strictEqual(f.calls.length, 2, 'a different token is verified separately');
  ok('verification is cached, so the 2.5s order poll does not hammer Supabase');
}

{
  let now = 0;
  const f = supabaseOk('user-8');
  const a = createApiAuth({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'k',
    fetchImpl: f,
    ttlMs: 1000,
    now: () => now,
  });
  await a.run(fakeReq({ url: '/api/dukan/orders', headers: { authorization: 'Bearer t' } }), fakeRes(), freshNext());
  now = 2000;
  await a.run(fakeReq({ url: '/api/dukan/orders', headers: { authorization: 'Bearer t' } }), fakeRes(), freshNext());
  assert.strictEqual(f.calls.length, 2, 'an expired token is re-verified');
  ok('a cached token is re-verified once it expires');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} API AUTH TESTS PASSED 🎉`);
console.log('========================================');
