import assert from 'assert';
import {
  LANGUAGES,
  LOCALE_PATHS,
  localePathFor,
  isSupportedLanguage,
  readStoredLanguage,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_CHOSEN_KEY,
} from '../src/data/languages.ts';

console.log('--- RUNNING LANGUAGE SECURITY & STORED CODE TESTS (#68) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// Mock localStorage for node environment
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// ── 1. Static Path Map Integrity ─────────────────────────────────────────────
for (const lang of LANGUAGES) {
  assert.strictEqual(
    LOCALE_PATHS[lang.code],
    `./i18n/locales/${lang.code}.json`,
    `Static path for ${lang.code} must be defined in LOCALE_PATHS`
  );
  assert.strictEqual(
    localePathFor(lang.code),
    `./i18n/locales/${lang.code}.json`,
    `localePathFor must resolve shipped language ${lang.code}`
  );
}
ok('All shipped languages map strictly to their static JSON paths');

// ── 2. Fallback on Path Traversal and Planted Values ──────────────────────────
const dangerousInputs = [
  '../../../../etc/passwd',
  '../locales/evil',
  'https://attacker.com/evil.json',
  '/var/log/secret',
  'en/../../secret',
  'klingon',
  '<script>alert(1)</script>',
  'null',
  '',
  '   ',
  null,
  undefined,
];

for (const input of dangerousInputs) {
  assert.strictEqual(
    localePathFor(input),
    LOCALE_PATHS.en,
    `Dangerous input ${JSON.stringify(input)} must fall back to English locale path`
  );
  assert.strictEqual(
    isSupportedLanguage(input),
    false,
    `Dangerous input ${JSON.stringify(input)} must not be supported`
  );
}
ok('All malicious, planted, and arbitrary paths fall back strictly to English locale path');

// ── 3. readStoredLanguage: Valid Stored Languages ─────────────────────────────
localStorage.clear();
assert.strictEqual(readStoredLanguage(), 'en', 'Missing storage defaults to English');

localStorage.setItem(LANGUAGE_STORAGE_KEY, 'hi');
localStorage.setItem(LANGUAGE_CHOSEN_KEY, 'true');
assert.strictEqual(readStoredLanguage(), 'hi', 'Valid Hindi code is accepted');

localStorage.setItem(LANGUAGE_STORAGE_KEY, 'TA ');
assert.strictEqual(readStoredLanguage(), 'ta', 'Case and whitespace are normalized');
ok('Valid stored languages are accepted and normalized');

// ── 4. readStoredLanguage: Planted Path Cleared On Read ───────────────────────
for (const bad of ['../../evil', '/etc/passwd', 'klingon', 'en-US']) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, bad);
  localStorage.setItem(LANGUAGE_CHOSEN_KEY, 'true');

  const resolved = readStoredLanguage();
  assert.strictEqual(
    resolved,
    'en',
    `Planted value ${JSON.stringify(bad)} must return English fallback`
  );
  assert.strictEqual(
    localStorage.getItem(LANGUAGE_STORAGE_KEY),
    null,
    `Planted value ${JSON.stringify(bad)} must be deleted from storage on read`
  );
  assert.strictEqual(
    localStorage.getItem(LANGUAGE_CHOSEN_KEY),
    null,
    `Chosen key must be cleared when stored language is unknown`
  );
}
ok('Planted and unknown language codes are cleared from storage immediately on read');

console.log('--- ALL LANGUAGE SECURITY TESTS PASSED ---');
