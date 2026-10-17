import assert from 'assert';
import { normalizeEmail, isLikelyEmail, parseConfirmedFlag } from '../supabase/functions/email-confirmation-status/logic.ts';

console.log('--- RUNNING EMAIL-CONFIRMATION STATUS TESTS ---');

const ok = (message) => console.log(`✓ ${message}`);

// ── Test 1: emails are normalised to a comparable key ───────────────────────
console.log('\nTest 1: normalizeEmail');
assert.strictEqual(normalizeEmail('  Foo@Example.COM '), 'foo@example.com', 'trimmed and lowercased');
assert.strictEqual(normalizeEmail('a@b.co'), 'a@b.co', 'already normal');
assert.strictEqual(normalizeEmail(null), '', 'null is not an email');
assert.strictEqual(normalizeEmail(undefined), '', 'undefined is not an email');
assert.strictEqual(normalizeEmail(42), '', 'a number is not an email');
ok('one casing and one trim, so the lookup matches auth.users');

// ── Test 2: obviously-broken input never reaches the database ───────────────
console.log('\nTest 2: isLikelyEmail rejects');
for (const value of ['', '   ', 'a', 'a@b', 'a@b.', '@b.co', 'a@@b.com', 'a b@c.com', null, undefined, 42, {}]) {
  assert.strictEqual(isLikelyEmail(value), false, `not an email: ${JSON.stringify(value)}`);
}
ok('malformed input is rejected before any lookup');

// ── Test 3: real addresses pass, including awkward but valid ones ───────────
console.log('\nTest 3: isLikelyEmail accepts');
for (const value of ['a@b.co', 'first.last+tag@sub.example.com', '  Mixed.Case@Example.COM  ']) {
  assert.strictEqual(isLikelyEmail(value), true, `is an email: ${value}`);
}
ok('plus tags, subdomains, case and padding are accepted');

// ── Test 4: only a real boolean true is a confirmation ─────────────────────
console.log('\nTest 4: parseConfirmedFlag');
assert.strictEqual(parseConfirmedFlag(true), true, 'the RPC returns a boolean');
for (const value of [false, 'true', 1, 0, null, undefined, {}, []]) {
  assert.strictEqual(parseConfirmedFlag(value), false, `not a confirmation: ${JSON.stringify(value)}`);
}
ok('only a boolean true confirms');

console.log('\n========================================');
console.log('🎉 ALL EMAIL-CONFIRMATION STATUS TESTS PASSED! 🎉');
console.log('========================================');