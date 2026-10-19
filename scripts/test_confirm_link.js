import assert from 'assert';
import { CONFIRM_TYPES, readEmailConfirmParams, parseConfirmationStatus, confirmTokenOnce, cleanConfirmUrl } from '../src/utils/confirmLink.ts';

console.log('--- RUNNING EMAIL-CONFIRM LINK TESTS ---');

// ── Test 1: the payload is read from the query string ────────────────────────
console.log('\nTest 1: query-string payload');
assert.deepStrictEqual(
  readEmailConfirmParams('https://app.example/confirm?token_hash=abc123&type=signup'),
  { tokenHash: 'abc123', type: 'signup' }
);
ok('token_hash + type in the query string are recognised');

// ── Test 2: the payload is read from the hash fragment too ───────────────────
console.log('\nTest 2: hash-fragment payload');
assert.deepStrictEqual(
  readEmailConfirmParams('https://app.example/#token_hash=abc123&type=signup'),
  { tokenHash: 'abc123', type: 'signup' },
  'Supabase can deliver the token in the fragment'
);
ok('token_hash + type in the fragment are recognised');

// ── Test 3: only the confirm types are claimed ──────────────────────────────
console.log('\nTest 3: type whitelist');
assert.deepStrictEqual(CONFIRM_TYPES, ['signup', 'email', 'email_change']);
for (const type of ['signup', 'email', 'email_change']) {
  assert.deepStrictEqual(
    readEmailConfirmParams(`https://app.example/confirm?token_hash=abc123&type=${type}`),
    { tokenHash: 'abc123', type },
    `${type} is a confirm type`
  );
}
ok('signup, email and email_change are claimed');

// ── Test 4: recovery and invite links are NOT claimed ───────────────────────
console.log('\nTest 4: other link types pass through');
for (const type of ['recovery', 'invite']) {
  assert.strictEqual(
    readEmailConfirmParams(`https://app.example/confirm?token_hash=abc123&type=${type}`),
    null,
    `${type} must not be swallowed by the confirm screen`
  );
}
ok('recovery and invite links are left alone');

// ── Test 5: an incomplete payload is not a payload ──────────────────────────
console.log('\nTest 5: missing pieces');
for (const href of [
  'https://app.example/confirm?type=signup',
  'https://app.example/confirm?token_hash=abc123',
  'https://app.example/confirm?token_hash=&type=signup',
  'https://app.example/',
  'https://app.example/dashboard?tab=orders',
  '',
  'not a url',
]) {
  assert.strictEqual(readEmailConfirmParams(href), null, `no payload in: ${href || '(empty)'}`);
}
ok('missing/empty token or type yields null');

// ── Test 6: the status response predicate ───────────────────────────────────
console.log('\nTest 6: parseConfirmationStatus');
assert.strictEqual(parseConfirmationStatus({ confirmed: true }), true, 'explicit true is confirmed');
for (const body of [
  { confirmed: false },
  { confirmed: 'true' },
  { confirmed: 1 },
  {},
  { confirmed: null },
  null,
  undefined,
  'yes',
  0,
]) {
  assert.strictEqual(parseConfirmationStatus(body), false, `not a confirmation: ${JSON.stringify(body)}`);
}
ok('only an explicit boolean true is a confirmation');

// ── Test 7: a token is spent exactly once, and everyone sees the outcome ────
console.log('\nTest 7: confirmTokenOnce');
let runs = 0;
const run = async () => ({ ok: true, run: ++runs });
const first = await confirmTokenOnce('hash-1', 'signup', run);
const second = await confirmTokenOnce('hash-1', 'signup', run);
assert.strictEqual(runs, 1, 'React StrictMode re-runs the effect, but the token must only be spent once');
assert.strictEqual(second.run, 1, 'the second caller waits on the same attempt instead of starting a new one');
assert.deepStrictEqual(first, second, 'both callers see the same outcome');
const third = await confirmTokenOnce('hash-1', 'signup', run);
assert.strictEqual(third.run, 1, 'replaying the same token reuses the settled outcome');
assert.strictEqual(runs, 1, 'and still only spends it once');
const other = await confirmTokenOnce('hash-2', 'signup', run);
assert.strictEqual(other.run, 2, 'a different token gets its own attempt');
assert.strictEqual(runs, 2, 'two tokens, two attempts');
ok('a token is spent once and its outcome is shared');

// ── Test 8: the token is wiped out of the address bar ───────────────────────
console.log('\nTest 8: cleanConfirmUrl');
{
  // The exact shape of the link the mail template sends.
  const query = 'https://app.example/?token_hash=pkce_c9c7310dd31c&type=signup';
  assert.strictEqual(cleanConfirmUrl(query), 'https://app.example/', 'token_hash and type are both removed');

  // A fragment-delivered token, which Supabase also uses.
  const fragment = 'https://app.example/#token_hash=pkce_abc123&type=signup';
  assert.strictEqual(cleanConfirmUrl(fragment), 'https://app.example/', 'a spent token is gone and the empty # with it');

  // Unrelated parameters survive: the app routes on ?tab= and on the hash.
  assert.strictEqual(
    cleanConfirmUrl('https://app.example/app?tab=orders&token_hash=pkce_abc&type=signup'),
    'https://app.example/app?tab=orders'
  );
  assert.strictEqual(
    cleanConfirmUrl('https://app.example/?token_hash=pkce_abc&type=signup#orders'),
    'https://app.example/#orders',
    'a hash that is a route rather than auth params is kept'
  );

  // A refused callback leaves error params behind that re-raise the toast on
  // every reload, so those go too.
  assert.strictEqual(
    cleanConfirmUrl('https://app.example/?error=access_denied&error_description=nope'),
    'https://app.example/'
  );

  // A URL with nothing to clean is returned untouched, and a broken one is not
  // mangled into something that navigates somewhere else.
  assert.strictEqual(cleanConfirmUrl('https://app.example/#sales'), 'https://app.example/#sales');
  assert.strictEqual(cleanConfirmUrl('not a url'), 'not a url');

  // Reading the payload from the cleaned URL must find nothing, which is the
  // whole point: a reload cannot replay a spent token.
  assert.strictEqual(readEmailConfirmParams(cleanConfirmUrl(query)), null);
}
ok('the real token is stripped from the query and the fragment, and nothing else is');

console.log('\n========================================');
console.log('🎉 ALL CONFIRM-LINK TESTS PASSED! 🎉');
console.log('========================================');

function ok(message) {
  console.log(`✓ ${message}`);
}