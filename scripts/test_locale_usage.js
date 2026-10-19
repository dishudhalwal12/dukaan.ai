import assert from 'assert';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every translation key the app asks for must exist in every shipped language.
 *
 * `t()` returns the key itself when a translation is missing, so a gap does not
 * fail loudly — it silently paints `label_store_address` on screen. Five of the
 * seven locale files were already missing 26 keys before this check existed, so
 * the guard is about the future: add a string, add it everywhere.
 *
 * The scan is static, so it only sees `t('literal')`. Keys reached through a
 * variable (the sales filters, product names) are covered by the "keys defined
 * in English must also exist elsewhere" half of the check below.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(root, 'public', 'i18n', 'locales');

console.log('--- RUNNING LOCALE USAGE TESTS ---');

const locales = ['en', 'hi', 'gu', 'kn', 'pa', 'ta', 'ur'];
const bundles = {};
for (const code of locales) {
  const path = join(LOCALES_DIR, `${code}.json`);
  assert.ok(fs.existsSync(path), `missing locale bundle: ${code}.json`);
  bundles[code] = JSON.parse(fs.readFileSync(path, 'utf8'));
}

// ── every locale must carry the same set of keys ────────────────────────────
{
  const english = Object.keys(bundles.en).sort();
  for (const code of locales) {
    const keys = Object.keys(bundles[code]).sort();
    const missing = english.filter((key) => !(key in bundles[code]));
    assert.deepStrictEqual(
      missing,
      [],
      `locale "${code}" is missing ${missing.length} key(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`
    );
    const extra = keys.filter((key) => !(key in bundles.en));
    assert.deepStrictEqual(extra, [], `locale "${code}" defines keys English does not: ${extra.join(', ')}`);
  }
  console.log(`✓ all ${locales.length} locales agree on ${english.length} keys`);
}

// ── collect t('…') / t("…") from the app source ─────────────────────────────
const SOURCE_ROOT = join(root, 'src');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
})(SOURCE_ROOT);

/** Comments are stripped so a key mentioned in prose is not treated as a call. */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const used = new Map(); // key -> first file that uses it
for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  const pattern = /\bt\(\s*(['"])([A-Za-z0-9_]+)\1\s*[,)]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[2];
    if (!used.has(key)) used.set(key, file.replace(`${root}/`, ''));
  }
}

console.log(`✓ scanned ${files.length} source files, found ${used.size} statically used keys`);

// ── and every one of them resolves in every language ────────────────────────
{
  const missing = [];
  for (const [key, file] of used) {
    for (const code of locales) {
      if (!(key in bundles[code])) missing.push(`${key} (used in ${file}, absent from ${code}.json)`);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `these strings would render as raw key names:\n  ${missing.slice(0, 20).join('\n  ')}`
  );
  console.log('✓ every key used in the app exists in every language');
}

// ── a few keys are reached through a variable, so they are named here ───────
{
  const dynamic = [
    'sales_filter_today',
    'sales_filter_week',
    'sales_filter_month',
    'orders_filter_new',
    'orders_filter_preparing',
    'orders_filter_history',
    'nav_dashboard',
    'nav_sales',
    'nav_orders',
    'nav_catalog',
    'nav_settings',
    'nav_produce',
    'nav_dairy',
  ];
  const missing = [];
  for (const key of dynamic) {
    for (const code of locales) {
      if (!(key in bundles[code])) missing.push(`${key} missing from ${code}.json`);
    }
  }
  assert.deepStrictEqual(missing, [], missing.join(', '));
  console.log('✓ keys resolved through a variable are present too');
}

console.log('\n========================================');
console.log('🎉 ALL LOCALE USAGE TESTS PASSED 🎉');
console.log('========================================');
