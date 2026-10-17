import assert from 'assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-level guard: no provider key may be injected into the browser bundle,
 * and the client must not call a model provider directly.
 *
 * The artifact-level guard (scripts/check-secrets.mjs) greps the built dist/ for
 * real secret values and runs on build. This one is fast, runs in `npm test`,
 * and fails the moment someone reintroduces the injection that leaked the live
 * OpenRouter key into the public bundle.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- RUNNING NO-KEY-IN-BUNDLE (SOURCE) TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const read = (rel) => readFileSync(join(root, rel), 'utf8');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

// ── 1. vite.config.ts injects no secret ──────────────────────────────────────
{
  const vite = read('vite.config.ts');
  for (const name of ['process.env.OPENROUTER_API_KEY', 'process.env.API_KEY', 'process.env.GEMINI_API_KEY']) {
    assert.ok(!vite.includes(name), `vite.config.ts must not inject ${name} into the bundle`);
  }
  assert.ok(!/define\s*:/.test(vite), 'vite.config.ts must have no define block at all');
  ok('vite.config.ts injects no provider key into the bundle');
}

// ── 2. the client never reads a key or calls a provider directly ─────────────
{
  const files = walk(join(root, 'src')).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('openrouter.ai'), `${file} must not call a provider directly`);
    assert.ok(!text.includes('VITE_OPENROUTER_API_KEY'), `${file} must not read a provider key`);
    assert.ok(!/gsk_|sk-or-v1-/.test(text), `${file} must not contain a key-shaped literal`);
  }
  ok('no client source calls a provider directly or reads a provider key');
}

// ── 3. the client routes AI through the bot ──────────────────────────────────
{
  const client = read('src/utils/openrouterClient.ts');
  assert.ok(
    client.includes("AI_CHAT_ENDPOINT = '/api/ai/chat/completions'"),
    'the client must reach the model through the bot proxy'
  );
  assert.ok(
    !/PRIMARY_OPENROUTER_KEY|BACKUP_OPENROUTER_KEY|resolveOpenRouterKeys/.test(client),
    'the client key machinery must be gone'
  );
  ok('the client calls the bot AI proxy and holds no key machinery');
}

// ── 4. the server holds the key and reads it from env ────────────────────────
{
  const proxy = read('whatsapp/aiProxy.js');
  assert.ok(proxy.includes("data_collection: 'deny'"), 'provider data collection must be denied');
  const server = read('whatsapp/server.js');
  assert.ok(
    server.includes('process.env.OPENROUTER_API_KEY'),
    'the bot, not the browser, must read the provider key'
  );
  assert.ok(server.includes("app.post('/api/ai/chat/completions'"), 'the bot must expose the AI proxy route');
  ok('the provider key is read by the bot and used only in the proxy route');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} NO-KEY-IN-BUNDLE TESTS PASSED 🎉`);
console.log('========================================');
