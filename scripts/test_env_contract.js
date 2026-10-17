import assert from 'assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The environment contract.
 *
 * There is exactly ONE file a human edits to change a key: the root .env. This
 * test guards that:
 *   1. the bot loads the root .env, not whatsapp/.env;
 *   2. every configuration variable the app reads is documented in
 *      .env.example, so no key is discoverable only by reading source;
 *   3. the example template offers no VITE_ home for a secret — the browser
 *      bundle is public, so a key placed there is a leak.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- RUNNING ENV CONTRACT TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// Names that belong to the app's own configuration. The filter keeps library
// and platform variables (NODE_ENV, LANG, SHELL, CI, ...) out of the contract.
const APP_PREFIXES = [
  'SUPABASE_',
  'OPENROUTER_',
  'GROQ_',
  'DUKAN_',
  'LLM_',
  'OPERATOR_',
  'CORS_',
  'ENABLE_OPS_',
  'VITE_',
];
const APP_EXACT = new Set(['AUTH_DIR', 'PORT']);

const isAppVar = (name) => APP_PREFIXES.some((p) => name.startsWith(p)) || APP_EXACT.has(name);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'auth_info') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

// ── 1. which variables does the app actually read? ───────────────────────────
const readNames = new Set();

for (const file of walk(join(root, 'src'))) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/import\.meta\.env\??\.([A-Z0-9_]+)/g)) readNames.add(m[1]);
}

for (const file of walk(join(root, 'whatsapp'))) {
  if (!file.endsWith('.js') || basename(file).startsWith('test_')) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) readNames.add(m[1]);
}

const appVars = [...readNames].filter(isAppVar).sort();
assert.ok(appVars.length > 5, `expected to find the app's config variables, found ${appVars.length}`);
ok(`the app reads ${appVars.length} configuration variables`);

// ── 2. the bot loads the ROOT .env ───────────────────────────────────────────
{
  for (const rel of ['whatsapp/server.js', 'whatsapp/dukanBot.js']) {
    const text = readFileSync(join(root, rel), 'utf8');
    assert.ok(
      /dotenv\.config\(\{\s*path:\s*path\.resolve\(__dirname,\s*'\.\.',\s*'\.env'\)/.test(text),
      `${rel} must load the root .env (one file for every key)`
    );
    assert.ok(
      !/dotenv\.config\(\{\s*path:\s*path\.resolve\(__dirname,\s*'\.env'\)/.test(text),
      `${rel} must not load whatsapp/.env`
    );
  }
  ok('the bot loads the single root .env, not whatsapp/.env');
}

// ── 3. every variable is documented in .env.example ──────────────────────────
{
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const missing = appVars.filter((name) => !new RegExp(`\\b${name}\\b`).test(example));
  assert.deepStrictEqual(
    missing,
    [],
    `these variables are read by the app but absent from .env.example: ${missing.join(', ')}`
  );
  ok('every configuration variable is documented in .env.example');
}

// ── 4. the template offers no VITE_ home for a secret ────────────────────────
{
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  for (const bad of ['VITE_OPENROUTER_API_KEY', 'VITE_GROQ_API_KEY', 'VITE_SUPABASE_SERVICE_KEY']) {
    assert.ok(!new RegExp(`^${bad}=`, 'm').test(example), `${bad} must not be settable — it would ship in the bundle`);
  }
  ok('the template never invites a secret into a VITE_ variable');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} ENV CONTRACT TESTS PASSED 🎉`);
console.log('========================================');
