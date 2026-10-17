import assert from 'assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The support number must be configuration, not a literal.
 *
 * The shopkeeper's own mobile number was hardcoded in two shipped screens, so it
 * was published in the public bundle. It now comes from VITE_SUPPORT_WHATSAPP,
 * and with no value set the UI hides the row rather than dialling a stranger.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- RUNNING SUPPORT-NUMBER TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ── 1. the personal number is gone from source ───────────────────────────────
{
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };

  const offenders = walk(join(root, 'src'))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => readFileSync(f, 'utf8').includes('9256487182'));

  assert.deepStrictEqual(offenders, [], `the personal number must not be in shipped source: ${offenders.join(', ')}`);
  ok('the hardcoded personal number is gone from src/');
}

// ── 2. the store sets, and waits on, the env-driven route ───────────────────
{
  const { hasSupportWhatsApp, SUPPORT_WHATSAPP_NUMBER, supportTelHref } = await import('../src/config/support.ts');
  assert.strictEqual(hasSupportWhatsApp, false, 'with no VITE_SUPPORT_WHATSAPP there must be no number to dial');
  assert.strictEqual(SUPPORT_WHATSAPP_NUMBER, '', 'an unset number is empty, never a default');
  assert.strictEqual(supportTelHref, 'tel:+', 'the href is derived, not hardcoded');
  ok('with no configured number the UI has nothing to dial (no default, no fallback)');
}

// ── 3. formatting ────────────────────────────────────────────────────────────
{
  const { normaliseWhatsAppNumber, formatWhatsAppNumber } = await import('../src/config/support.ts');

  assert.strictEqual(normaliseWhatsAppNumber('+91 98765 43210'), '919876543210');
  assert.strictEqual(normaliseWhatsAppNumber('(91)-98765-43210'), '919876543210');
  assert.strictEqual(normaliseWhatsAppNumber(''), '');
  assert.strictEqual(normaliseWhatsAppNumber(null), '');
  assert.strictEqual(normaliseWhatsAppNumber(undefined), '');
  ok('a number is normalised to digits whatever the punctuation');

  assert.strictEqual(formatWhatsAppNumber('919876543210'), '+91 98765 43210');
  assert.strictEqual(formatWhatsAppNumber('9876543210'), '+91 98765 43210', 'a bare 10-digit number is assumed Indian');
  assert.strictEqual(formatWhatsAppNumber(''), '', 'nothing formats to nothing');
  ok('a number is displayed in a readable Indian format');
}

// ── 4. the template documents it ─────────────────────────────────────────────
{
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  assert.ok(/^VITE_SUPPORT_WHATSAPP=/m.test(example), '.env.example must document VITE_SUPPORT_WHATSAPP');
  ok('.env.example documents the support number as the one place to change it');
}

// ── 5. the screens read it rather than embedding it ──────────────────────────
{
  for (const rel of ['src/screens/settings/HelpCenterScreen.tsx', 'src/screens/SettingsScreen.tsx']) {
    const text = readFileSync(join(root, rel), 'utf8');
    assert.ok(/from '.*config\/support/.test(text), `${rel} must take the number from config/support`);
    assert.ok(/hasSupportWhatsApp/.test(text), `${rel} must hide the action when no number is configured`);
  }
  ok('both contact screens take the number from config and hide it when unset');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} SUPPORT-NUMBER TESTS PASSED 🎉`);
console.log('========================================');
