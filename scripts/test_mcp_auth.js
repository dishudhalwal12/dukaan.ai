import assert from 'assert';
import { createVerifier, authUserId } from '../mcp/auth.js';

console.log('--- RUNNING MCP AUTH VERIFIER TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `h.${Buffer.from(JSON.stringify({ sub: 'user-1', exp, client_id: 'client-9' })).toString('base64url')}.s`;

let calls = 0;
const fetchImpl = async (url, init) => {
  calls++;
  assert.match(String(url), /\/auth\/v1\/user$/);
  assert.strictEqual(init.headers.Authorization, `Bearer ${token}`);
  return new Response(JSON.stringify({ id: 'user-1', email: 'asha@example.com' }), { status: 200 });
};

const verifier = createVerifier(
  { supabaseUrl: 'https://project.supabase.co', serviceKey: 'service-key' },
  { fetchImpl, ttlMs: 60_000 }
);
const info = await verifier.verifyAccessToken(token);
assert.strictEqual(info.token, token);
assert.strictEqual(info.clientId, 'client-9');
assert.strictEqual(info.expiresAt, exp);
assert.deepStrictEqual(info.extra, { userId: 'user-1', email: 'asha@example.com' });
assert.strictEqual(authUserId(info), 'user-1');
assert.strictEqual(calls, 1);
ok('a valid Supabase token becomes AuthInfo with the user id');

await verifier.verifyAccessToken(token);
assert.strictEqual(calls, 1, 'a verified token is cached');
ok('verification is cached for the TTL');

const rejected = createVerifier(
  { supabaseUrl: 'https://project.supabase.co', serviceKey: 'service-key' },
  { fetchImpl: async () => new Response('{}', { status: 401 }) }
);
let code = '';
try {
  await rejected.verifyAccessToken(token);
} catch (error) {
  code = String(error.message || error);
}
assert.match(code, /invalid|expired|token/i);
ok('a rejected token throws');

const noExp = createVerifier(
  { supabaseUrl: 'https://project.supabase.co', serviceKey: 'service-key' },
  { fetchImpl: async () => new Response(JSON.stringify({ id: 'user-2' }), { status: 200 }) }
);
const noExpToken = `h.${Buffer.from(JSON.stringify({ sub: 'user-2' })).toString('base64url')}.s`;
const noExpInfo = await noExp.verifyAccessToken(noExpToken);
assert(noExpInfo.expiresAt > Math.floor(Date.now() / 1000), 'missing exp gets a short safe expiry');
ok('a token without exp still gets an expiry so the SDK gate accepts it');

console.log(`\nAll ${n} MCP auth checks passed.`);
