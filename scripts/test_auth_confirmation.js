import assert from 'assert';
import { confirmEmail, getEmailConfirmationStatus } from '../src/services/auth.ts';

console.log('--- RUNNING EMAIL-CONFIRMATION CLIENT TESTS ---');

const ok = (message) => console.log(`✓ ${message}`);

// These run with no Supabase configured (the client falls back to a placeholder
// project outside a browser), so every guard must settle a result rather than
// throwing or reaching the network.

// ── Test 1: a link type this app does not handle is refused, not verified ───
console.log('\nTest 1: confirmEmail type guard');
const recovery = await confirmEmail('abc123', 'recovery');
assert.strictEqual(recovery.user, null, 'nothing is signed in');
assert.ok(typeof recovery.error === 'string' && recovery.error.length > 0, 'an error is reported');
assert.ok(recovery.error.includes('recovery'), `the error names the type it refused: ${recovery.error}`);
ok('recovery links are refused by name');

// ── Test 2: an empty token is refused ───────────────────────────────────────
console.log('\nTest 2: confirmEmail token guard');
const empty = await confirmEmail('', 'signup');
assert.strictEqual(empty.user, null, 'nothing is signed in');
assert.ok(typeof empty.error === 'string' && empty.error.length > 0, 'an error is reported');
ok('an empty token never reaches verifyOtp');

// ── Test 3: junk is not looked up ───────────────────────────────────────────
console.log('\nTest 3: getEmailConfirmationStatus guards');
for (const email of ['not-an-email', '', 'a@b']) {
  assert.strictEqual(await getEmailConfirmationStatus(email), false, `no lookup for: ${email || '(empty)'}`);
}
assert.strictEqual(await getEmailConfirmationStatus('a@b.co'), false, 'unconfigured Supabase reports not-confirmed');
ok('an unusable address short-circuits to false');

console.log('\n========================================');
console.log('🎉 ALL EMAIL-CONFIRMATION CLIENT TESTS PASSED! 🎉');
console.log('========================================');