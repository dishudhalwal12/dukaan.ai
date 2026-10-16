// Guards the suite itself.
//
// A developer's whatsapp/.env holds live Supabase and model credentials. A test
// run must never inherit them: the round-1 lesson was that inheriting them made
// a suite silently read (and could make it write) the real registry, and that a
// live model call costs money for no assertion.
//
// The invariant is behavioural, not structural: with the shared test setup
// imported first, the registry must read as unconfigured and no provider call
// may reach the network.
import './test_setup_orders_file.js';
import assert from 'assert';

await import('./dukanBot.js'); // loads whatsapp/.env — the path that used to win
const { registryStatus, cloudConfig, loadShopCatalog } = await import('./dukanCloud.js');
const { loadShops } = await import('./dukanShops.js');

console.log('--- RUNNING SUITE HERMETICITY TESTS (T8) ---');

// ── 1: a live .env must not make the registry look configured ────────────────
assert.strictEqual(
  cloudConfig().configured,
  false,
  'a test run inherited live Supabase credentials from .env'
);
assert.strictEqual(
  registryStatus(),
  'unconfigured',
  'a test run must read the shop registry as unconfigured'
);
console.log('✓ 1: live .env credentials do not turn the cloud on inside a test run');

// ── 2: no provider call may reach the network ───────────────────────────────
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  throw new Error('a test tried to reach the network');
};
let catalog;
try {
  const shops = await loadShops();
  catalog = await loadShopCatalog('some-owner');
  assert.ok(shops === null || Array.isArray(shops), 'loadShops resolves without the network');
} finally {
  globalThis.fetch = realFetch;
}
assert.strictEqual(calls, 0, `a test path reached the network ${calls} time(s)`);
assert.ok(catalog.length > 0, 'the unconfigured catalog still falls back to the local default');
console.log('✓ 2: loadShops/loadShopCatalog make zero network calls');

// ── 3: the model is not reachable either (tokens cost money) ────────────────
assert.strictEqual(process.env.GROQ_API_KEY, '', 'GROQ_API_KEY must be pinned empty for tests');
assert.strictEqual(process.env.OPENROUTER_API_KEY, '', 'OPENROUTER_API_KEY must be pinned empty for tests');
console.log('✓ 3: no live model credentials survive into a test run');

// ── 4: the stores are throwaway, never the developer's own ──────────────────
const os = await import('os');
const path = await import('path');
const tmp = os.tmpdir();
for (const key of ['DUKAN_ORDERS_FILE', 'DUKAN_CATALOG_FILE']) {
  assert.ok(
    String(process.env[key]).startsWith(tmp),
    `${key} must point into a throwaway directory, not the live store`
  );
}
console.log('✓ 4: order/catalog stores are pinned to a throwaway directory');

console.log('\n========================================');
console.log('🎉 ALL 4 SUITE HERMETICITY TESTS PASSED 🎉');
console.log('========================================');
