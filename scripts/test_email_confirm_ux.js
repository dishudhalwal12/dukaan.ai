import assert from 'assert';
import { mailTargetFor, GMAIL_APP_URL, GMAIL_WEB_URL, MAIL_FALLBACK_MS, shouldCancelMailFallback } from '../src/utils/openMail.ts';
import { isUnconfirmedEmailError } from '../src/utils/authOutcome.ts';

console.log('--- RUNNING EMAIL-CONFIRM UX TESTS ---');

// ── Test 1: phones deep-link to the Gmail app, desktops go to web Gmail ──────
console.log('\nTest 1: mailTargetFor');
const app = [
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36', // Android tablet, no "Mobile"
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
];
for (const ua of app) {
  assert.strictEqual(mailTargetFor(ua), 'app', `expected app target for: ${ua.slice(0, 40)}`);
}
const web = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  '',
];
for (const ua of web) {
  assert.strictEqual(mailTargetFor(ua), 'web', `expected web target for: ${ua.slice(0, 40) || '(empty)'}`);
}
console.log('✓ Test 1 Passed: phones → app, desktops → web');

// ── Test 2: the two targets are distinct, real URLs ──────────────────────────
console.log('\nTest 2: target URLs');
assert.strictEqual(GMAIL_APP_URL, 'googlegmail://', 'app target is the Gmail scheme');
assert.ok(GMAIL_WEB_URL.startsWith('https://mail.google.com/'), 'web target is Gmail over https');
assert.notStrictEqual(GMAIL_APP_URL, GMAIL_WEB_URL, 'app and web targets must differ');
console.log('✓ Test 2 Passed: distinct app/web URLs');

// ── Test 3: "email not confirmed" is recognised however Supabase cases it ────
console.log('\nTest 3: isUnconfirmedEmailError');
for (const msg of ['Email not confirmed', 'email not confirmed', 'Email Not Confirmed', 'Not confirmed']) {
  assert.strictEqual(isUnconfirmedEmailError(msg), true, `should match: ${msg}`);
}
for (const msg of ['Invalid login credentials', 'User already registered', '', '  ']) {
  assert.strictEqual(isUnconfirmedEmailError(msg), false, `should not match: "${msg}"`);
}
assert.strictEqual(isUnconfirmedEmailError(null), false, 'null is not a match');
assert.strictEqual(isUnconfirmedEmailError(undefined), false, 'undefined is not a match');
console.log('✓ Test 3 Passed: not-confirmed detected, other errors ignored');

// ── Test 4: the app-open window is wide enough for a cold app switch ─────────
console.log('\nTest 4: MAIL_FALLBACK_MS');
assert.ok(MAIL_FALLBACK_MS >= 1200, `fallback window too short: ${MAIL_FALLBACK_MS}ms`);
assert.ok(MAIL_FALLBACK_MS <= 3000, `fallback would strand the user: ${MAIL_FALLBACK_MS}ms`);
console.log('✓ Test 4 Passed: fallback window is 1200–3000ms');

// ── Test 5: only a hidden page (the app opened) cancels the fallback ─────────
console.log('\nTest 5: shouldCancelMailFallback');
assert.strictEqual(shouldCancelMailFallback('hidden'), true, 'a backgrounded page means the app opened');
assert.strictEqual(shouldCancelMailFallback('visible'), false, 'a visible page must keep the fallback armed');
assert.strictEqual(shouldCancelMailFallback(''), false, 'unknown state must keep the fallback armed');
console.log('✓ Test 5 Passed: only hidden cancels the fallback');

console.log('\n========================================');
console.log('🎉 ALL EMAIL-CONFIRM UX TESTS PASSED! 🎉');
console.log('========================================');