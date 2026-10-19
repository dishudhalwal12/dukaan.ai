import assert from 'assert';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeAuthFailure, isInvalidCredentialsCode } from '../src/utils/authMessages.ts';
import {
  shouldAbandonPendingOAuth,
  shouldIgnoreFocusSession,
  urlCarriesOAuthCallback,
} from '../src/utils/oauthState.ts';
import {
  OWNERSHIP_REBOOT_COOLDOWN_MS,
  shouldReloadForOwnership,
} from '../src/utils/localStore.ts';
import {
  LANGUAGES,
  isSupportedLanguage,
  shouldAdoptRemoteLanguage,
} from '../src/data/languages.ts';
import { languageInstruction, languageName } from '../src/utils/languageName.ts';
import { normalizeStock, normalizeQuantity, isValidStockInput } from '../src/utils/stock.ts';
import { resolveTabsFromBusinessType } from '../src/utils/tabResolver.ts';
import { localizedFallbackQuestions } from '../src/data/onboardingQuestions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
const ok = (message) => console.log(`✓ ${++n}: ${message}`);

console.log('--- RUNNING UI-FIX REGRESSION TESTS ---');

// ── 1. Supabase's raw sign-in string never reaches the screen ────────────────
console.log('\nTest 1: sign-in failure copy');
{
  const wrongPassword = describeAuthFailure({
    message: 'Invalid login credentials',
    code: 'invalid_credentials',
    status: 400,
  });
  assert.ok(!/invalid login credentials/i.test(wrongPassword.text), 'the provider string must not be shown');
  assert.ok(!/supabase/i.test(wrongPassword.text), 'the provider name must not be shown either');
  assert.strictEqual(wrongPassword.action, 'sign-up', 'an unknown address gets a one-tap route to sign up');

  // Same failure, but the code is the only signal (no English message).
  assert.strictEqual(
    describeAuthFailure({ code: 'invalid_credentials' }).action,
    'sign-up',
    'the decision is made on the code, not on English text matching'
  );
  assert.ok(isInvalidCredentialsCode('INVALID_CREDENTIALS'), 'the code comparison is case-insensitive');

  // A rate limit must not be mistaken for a wrong password.
  const limited = describeAuthFailure({ message: 'Request rate limit reached', status: 429 });
  assert.ok(/wait/i.test(limited.text), 'a rate limit tells the user to wait');
  assert.strictEqual(limited.action, 'none', 'and does not suggest creating a second account');

  // Offline is a different problem with different advice.
  assert.ok(/internet/i.test(describeAuthFailure({ message: 'Failed to fetch' }).text));

  // Sign-up keeps its own wording, and an existing address is named.
  assert.strictEqual(describeAuthFailure({ isSignUp: true }).action, 'none');
  assert.ok(/already exists/i.test(describeAuthFailure({ isSignUp: true, code: 'account_exists' }).text));

  // Nothing to go on: still no jargon, still no claim about the account.
  const unknown = describeAuthFailure({ message: 'Something the provider invented' });
  assert.ok(!/invalid login/i.test(unknown.text));
  ok('provider errors are translated into plain words');
}

// ── 2. Returning from Google is not a sign-out ──────────────────────────────
console.log('\nTest 2: OAuth focus handling');
{
  assert.strictEqual(urlCarriesOAuthCallback('https://app.example/?code=abc'), true);
  assert.strictEqual(urlCarriesOAuthCallback('https://app.example/#access_token=abc&type=signup'), true);
  assert.strictEqual(urlCarriesOAuthCallback('https://app.example/'), false);
  assert.strictEqual(urlCarriesOAuthCallback('https://app.example/?error=access_denied'), false, 'a refused callback is not a success callback');

  // The bug behind the "refresh loop": a session-less answer read while the
  // exchange is in flight was treated as a sign-out.
  assert.strictEqual(
    shouldIgnoreFocusSession({ pending: true, callbackInUrl: false, hasSession: false }),
    true,
    'a pending Google sign-in suppresses the focus check'
  );
  assert.strictEqual(
    shouldIgnoreFocusSession({ pending: false, callbackInUrl: true, hasSession: false }),
    true,
    'a callback still in the URL suppresses it too'
  );
  assert.strictEqual(
    shouldIgnoreFocusSession({ pending: false, callbackInUrl: false, hasSession: false }),
    false,
    'an ordinary focus with no sign-in in flight is still checked'
  );

  // A consent window that was closed is written off, so the button recovers.
  assert.strictEqual(
    shouldAbandonPendingOAuth({ pending: true, callbackInUrl: false, hasSession: false }),
    true,
    'closing the consent window abandons the attempt'
  );
  assert.strictEqual(
    shouldAbandonPendingOAuth({ pending: true, callbackInUrl: true, hasSession: false }),
    false,
    'but never while the callback is being exchanged'
  );
  assert.strictEqual(
    shouldAbandonPendingOAuth({ pending: true, callbackInUrl: false, hasSession: true }),
    false,
    'and never when it actually signed in'
  );
  ok('a closed Google window no longer looks like a sign-out');
}

// ── 3. The ownership reload is a one-shot ───────────────────────────────────
console.log('\nTest 3: ownership reload guard');
{
  const now = 1_000_000;
  assert.strictEqual(shouldReloadForOwnership(0, now), true, 'a first drop reloads');
  assert.strictEqual(shouldReloadForOwnership(now - 1_000, now), false, 'a second drop moments later does not');
  assert.strictEqual(
    shouldReloadForOwnership(now - OWNERSHIP_REBOOT_COOLDOWN_MS - 1, now),
    true,
    'the guard expires, so a genuine later drop still reloads'
  );
  assert.strictEqual(shouldReloadForOwnership(Number.NaN, now), true, 'an unreadable timestamp does not wedge the app');
  assert.strictEqual(shouldReloadForOwnership(now, Number.NaN), false, 'and a broken clock does not hammer the reload');
  ok('the reload that dropped cached data cannot re-arm itself');
}

// ── 4. Language: which one wins, this device or the account ─────────────────
console.log('\nTest 4: language precedence');
{
  assert.strictEqual(shouldAdoptRemoteLanguage('hi', false), true, 'a device with no choice adopts the account language');
  assert.strictEqual(shouldAdoptRemoteLanguage('hi', true), false, 'a choice made here is never overwritten');
  assert.strictEqual(shouldAdoptRemoteLanguage(null, false), false, 'nothing stored changes nothing');
  assert.strictEqual(shouldAdoptRemoteLanguage('klingon', false), false, 'an unsupported code is not applied');

  assert.strictEqual(isSupportedLanguage('HI'), true, 'codes are compared case-insensitively');
  assert.strictEqual(isSupportedLanguage('en-GB'), false, 'a regional tag is not a shipped locale');

  // Every advertised language must have a translation file, or the picker offers
  // a language that renders as an empty app.
  for (const option of LANGUAGES) {
    const file = join(root, 'public', 'i18n', 'locales', `${option.code}.json`);
    assert.ok(fs.existsSync(file), `missing locale file for ${option.code}`);
    const keys = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.ok(keys.includes('nav_dashboard'), `locale ${option.code} has no nav labels`);
  }
  assert.strictEqual(new Set(LANGUAGES.map((l) => l.code)).size, LANGUAGES.length, 'no duplicate language codes');
  ok('the account language is restored only when this device has no choice');
}

// ── 5. The AI questionnaire is asked for in the chosen language ─────────────
console.log('\nTest 5: questionnaire localisation');
{
  assert.ok(/Hindi/.test(languageInstruction('hi')), 'a Hindi user is asked for Hindi');
  assert.ok(/Devanagari/.test(languageInstruction('hi')), 'and for the right script');
  assert.ok(/Do not answer in English/.test(languageInstruction('hi')), 'and it explicitly rules English out');
  assert.strictEqual(languageInstruction('en'), 'Write in simple English.');
  assert.strictEqual(languageName('ta'), 'Tamil');
  assert.strictEqual(languageName('xx'), 'English', 'an unknown code falls back to English');

  // Hindi has its own offline question set; every question must be answerable.
  const hindi = localizedFallbackQuestions('hi');
  assert.ok(Array.isArray(hindi) && hindi.length >= 3, 'Hindi has a fallback set');
  for (const question of hindi) {
    assert.ok(question.title.trim().length > 0, 'every question has a title');
    assert.ok(typeof question.intent === 'string' && /^[a-z_]+$/.test(question.intent), 'intent stays a machine-readable code');
    if (question.type === 'select') {
      assert.ok(question.options && question.options.length > 0, 'a select question has options');
    }
  }
  // Every shipped language has its own offline set, so the fallback question is
  // never English in a non-English UI.
  for (const { code } of LANGUAGES) {
    const fallback = localizedFallbackQuestions(code);
    assert.ok(Array.isArray(fallback) && fallback.length >= 3, `${code} has a fallback set`);
    assert.deepStrictEqual(
      fallback.map((question) => question.intent),
      hindi.map((question) => question.intent),
      `${code} asks the same intents as Hindi`,
    );
  }
  assert.deepStrictEqual(
    localizedFallbackQuestions('xx').map((question) => question.title),
    localizedFallbackQuestions('en').map((question) => question.title),
    'an unknown code falls back to English',
  );
  ok('the questionnaire follows the chosen language, with English intents');
}

// ── 6. Stock and quantity can never go below their floor ────────────────────
console.log('\nTest 6: stock clamps');
{
  assert.strictEqual(normalizeStock(-5), 0, 'a typed negative stock becomes 0');
  assert.strictEqual(normalizeStock('-5'), 0, 'the form hands over a string, not a number');
  assert.strictEqual(normalizeStock('12'), 12);
  assert.strictEqual(normalizeStock(''), 0);
  assert.strictEqual(normalizeStock(null), 0);
  assert.strictEqual(normalizeStock(undefined), 0);
  assert.strictEqual(normalizeStock('abc'), 0);
  assert.strictEqual(normalizeStock(Number.NaN), 0, 'NaN must not reach the database');
  assert.strictEqual(normalizeStock(Infinity), 0);
  assert.strictEqual(normalizeStock(3.9), 3, 'a stock count is a whole number');
  assert.strictEqual(normalizeStock(0), 0, 'zero is a valid count');

  assert.strictEqual(normalizeQuantity(-3), 1, 'a negative order line becomes one unit');
  assert.strictEqual(normalizeQuantity('0'), 1, 'ordering zero of something is not a line');
  assert.strictEqual(normalizeQuantity(''), 1);
  assert.strictEqual(normalizeQuantity('abc'), 1);
  assert.strictEqual(normalizeQuantity(4), 4);
  assert.strictEqual(normalizeQuantity(4.8), 4);

  // The form can tell the difference between "0, which is sold out" and "-5,
  // which is not a count".
  assert.strictEqual(isValidStockInput('0'), true);
  assert.strictEqual(isValidStockInput('-5'), false);
  assert.strictEqual(isValidStockInput('2.5'), false);
  assert.strictEqual(isValidStockInput('abc'), false);
  assert.strictEqual(isValidStockInput(''), false);
  assert.strictEqual(isValidStockInput(' 7 '), true);
  ok('negative stock and negative quantities are impossible at every entry point');
}

// ── 7. The bottom bar follows the language ──────────────────────────────────
console.log('\nTest 7: navigation labels');
{
  // A translator that records which key it was asked for.
  const seen = [];
  const translate = (key) => {
    seen.push(key);
    return `<${key}>`;
  };

  const grocery = resolveTabsFromBusinessType('Kirana / General Store', null, translate);
  assert.deepStrictEqual(grocery.map((tab) => tab.key), ['DASHBOARD', 'SALES', 'ORDERS', 'CATALOG', 'SETTINGS']);
  assert.deepStrictEqual(grocery.map((tab) => tab.label), [
    '<nav_dashboard>', '<nav_sales>', '<nav_orders>', '<nav_catalog>', '<nav_settings>',
  ]);
  assert.ok(!grocery.some((tab) => /Dashboard|Sales|Orders|Catalog|Settings/.test(tab.label)), 'no English literals survive');

  // A greengrocer keeps the friendlier word, still through the translator.
  assert.strictEqual(resolveTabsFromBusinessType('Fruits & Vegetables', null, translate)[3].label, '<nav_produce>');
  assert.strictEqual(resolveTabsFromBusinessType('Dairy & Milk Booth', null, translate)[3].label, '<nav_dairy>');

  // Without a translator the resolver still returns stable keys, so a caller
  // that has no language (a test, a script) is not broken.
  assert.strictEqual(resolveTabsFromBusinessType('Kirana / General Store', null)[0].label, 'nav_dashboard');
  assert.ok(seen.length > 0);
  ok('nav labels come from translation keys, per business type');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} UI-FIX REGRESSION TESTS PASSED 🎉`);
console.log('========================================');
