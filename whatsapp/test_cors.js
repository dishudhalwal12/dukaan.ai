import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import { parseOrigins, originAllowed, corsOptionsFor, FIRST_PARTY_ORIGINS } from './corsPolicy.js';

console.log('--- RUNNING CORS POLICY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const PROD = ['https://dukaan-ai-beta.vercel.app', 'https://aurelio-chasmy-dorsiventrally.ngrok-free.dev'];

// ── parseOrigins ─────────────────────────────────────────────────────────────
assert.deepStrictEqual(parseOrigins('a, b , c'), ['a', 'b', 'c']);
assert.deepStrictEqual(parseOrigins('https://x.dev/, https://y.dev'), ['https://x.dev', 'https://y.dev'],
  'a trailing slash is trimmed so the compare is on the origin, not the path');
assert.deepStrictEqual(parseOrigins(''), []);
assert.deepStrictEqual(parseOrigins(undefined), []);
assert.deepStrictEqual(parseOrigins(' , , '), []);
ok('CORS_ORIGINS parses into a clean allowlist, tolerating spaces and trailing slashes');

// ── originAllowed ────────────────────────────────────────────────────────────
assert.strictEqual(originAllowed(undefined, PROD), true,
  'a request with no Origin header (curl, the bot itself) is not a CORS request at all');
assert.strictEqual(originAllowed('https://dukaan-ai-beta.vercel.app', PROD), true);
assert.strictEqual(originAllowed('https://aurelio-chasmy-dorsiventrally.ngrok-free.dev', PROD), true);
assert.ok(FIRST_PARTY_ORIGINS.includes('https://dukaan-ai-hypnexis.vercel.app'),
  'the project domain must be allowed: beta redirects there and CORS is judged on the final origin');
assert.strictEqual(originAllowed('https://dukaan-ai-hypnexis.vercel.app', PROD), false,
  'the env list alone need not name it — server.js unions FIRST_PARTY_ORIGINS into the allowlist');
assert.strictEqual(originAllowed('https://evil.example', PROD), false);
assert.strictEqual(originAllowed('https://dukaan-ai-beta.vercel.app.evil.example', PROD), false,
  'a suffix match is NOT a match — this is the classic allowlist bypass');
assert.strictEqual(originAllowed('https://evil.example/?x=https://dukaan-ai-beta.vercel.app', PROD), false);
assert.strictEqual(originAllowed('dukaan-ai-beta.vercel.app', PROD), false, 'a bare host is not an origin');
ok('an origin is allowed only on an exact match against the allowlist');

// ── corsOptionsFor: what the `cors` middleware is actually configured with ───
const opts = corsOptionsFor({ allowedOrigins: PROD, allowLocalhost: true });

const decide = (origin) => {
  let result;
  opts.origin(origin, (err, allow) => { result = { err, allow }; });
  return result;
};

assert.deepStrictEqual(decide('https://dukaan-ai-beta.vercel.app'), { err: null, allow: true });
const liveOpts = corsOptionsFor({ allowedOrigins: [...new Set([...FIRST_PARTY_ORIGINS, ...PROD])] });
let liveDecision;
liveOpts.origin('https://dukaan-ai-hypnexis.vercel.app', (err, allow) => { liveDecision = { err, allow }; });
assert.deepStrictEqual(liveDecision, { err: null, allow: true },
  'the redirect target must pass, or the live POS cannot reach the bot');
ok('the production frontend and its redirect target are both allowed');

assert.deepStrictEqual(decide('http://localhost:3000'), { err: null, allow: true });
assert.deepStrictEqual(decide('http://127.0.0.1:5173'), { err: null, allow: true });
ok('local dev ports are allowed, so the Vite dev server still works');

assert.strictEqual(decide('https://evil.example').allow, false);
ok('an unknown origin is refused (the header is simply not sent, so the browser blocks it)');

assert.strictEqual(decide(undefined).allow, true);
ok('a same-origin or non-browser request passes');

// The browser will preflight the custom header the app sends to skip ngrok's
// warning page, so it must be in the allowed list or every /api call fails.
const headers = opts.allowedHeaders.map((h) => h.toLowerCase());
assert.ok(headers.includes('authorization'), 'authorization must be an allowed header (Bearer token on every call)');
assert.ok(headers.includes('ngrok-skip-browser-warning'),
  'ngrok-skip-browser-warning must be allowed or every cross-origin call hits the interstitial');
assert.ok(headers.includes('content-type'));
ok('the preflight allows the Bearer token and the ngrok bypass header');

assert.strictEqual(opts.credentials, undefined,
  'no cookie credentials are used, so credential support stays off');
ok('credentials are not enabled: the app authenticates with a Bearer token, not cookies');

console.log('\n========================================');
console.log(`🎉 ALL ${n} CORS POLICY TESTS PASSED 🎉`);
console.log('========================================');
