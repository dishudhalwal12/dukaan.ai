import assert from 'assert';
import {
  reconcileCatalog,
  staleExternalIds,
  migratePresetCatalog,
  isOldPresetId,
  LEGACY_SEED_IDS,
} from '../src/utils/catalogSync.js';
import { catalogPreset } from '../src/data/presetProducts.js';

console.log('--- RUNNING CATALOG RECONCILE TESTS ---');

// ── Legacy seed rows ─────────────────────────────────────────────────────────
// Old builds seeded `prod1`–`prod4` with i18n keys as names. Once a preset
// catalog applies, the four rows are duplicates that render in the wrong
// language, so they must be dropped.
const legacy = [
  { id: 'prod1', name: 'product_maggi' },
  { id: 'prod2', name: 'product_amul_milk' },
  { id: 'prod3', name: 'product_parle_g' },
  { id: 'prod4', name: 'product_tata_salt' },
];
const preset = [
  { id: 'kirana_1', name: 'Maggi 2-Minute Noodles' },
  { id: 'kirana_2', name: 'Amul Taaza Toned Milk' },
];

assert.strictEqual(reconcileCatalog([...legacy, ...preset], { dropLegacySeed: true }).length, 2);
assert.deepStrictEqual(
  reconcileCatalog([...legacy, ...preset], { dropLegacySeed: true }).map((p) => p.id),
  ['kirana_1', 'kirana_2'],
  'preset rows survive, legacy rows do not'
);
assert.strictEqual(
  reconcileCatalog([...legacy, ...preset]).length,
  6,
  'without a preset seed the legacy rows are kept, so a custom catalog is not truncated'
);
assert.strictEqual(
  reconcileCatalog(legacy, { dropLegacySeed: true }).length,
  0,
  'legacy-only catalogs become empty instead of keeping the wrong rows'
);

// ── Duplicate ids ────────────────────────────────────────────────────────────
const dupIds = [
  { id: 'kirana_1', name: 'Maggi 2-Minute Noodles' },
  { id: 'kirana_1', name: 'Maggi 2-Minute Noodles (copy)' },
];
assert.strictEqual(reconcileCatalog(dupIds).length, 1, 'repeated ids collapse to the first row');
assert.strictEqual(reconcileCatalog(dupIds)[0].name, 'Maggi 2-Minute Noodles');

// ── Duplicate names ──────────────────────────────────────────────────────────
const dupNames = [
  { id: 'kirana_1', name: 'Maggi 2-Minute Noodles' },
  { id: 'prod1', name: 'Maggi 2-Minute Noodles' },
];
assert.deepStrictEqual(
  reconcileCatalog(dupNames).map((p) => p.id),
  ['kirana_1'],
  'an exact duplicate name keeps the first row, which is the preset row after legacy removal'
);
assert.deepStrictEqual(
  reconcileCatalog([
    { id: 'a', name: 'Parle-G Biscuits' },
    { id: 'b', name: 'parle-g biscuits' },
  ]).map((p) => p.id),
  ['a'],
  'name comparison ignores case'
);

// ── Malformed input ──────────────────────────────────────────────────────────
assert.deepStrictEqual(reconcileCatalog(null), []);
assert.deepStrictEqual(
  reconcileCatalog([null, {}, { id: '', name: 'x' }, { id: 'y', name: '' }]),
  [],
  'rows without an id or name cannot be addressed and are dropped'
);

// ── Stale cloud rows ─────────────────────────────────────────────────────────
// The bot reads `products` directly, so a deleted product must also be deleted
// in the cloud or it stays orderable forever.
const cloudRows = [
  { external_id: 'kirana_1' },
  { external_id: 'prod1' },
  { external_id: 'prod2' },
  { external_id: 'ghost' },
  { external_id: 'ghost' },
  { external_id: null },
];
const local = [{ id: 'kirana_1' }, { id: 'kirana_2' }];
assert.deepStrictEqual(
  staleExternalIds(cloudRows, local),
  ['prod1', 'prod2', 'ghost'],
  'only ids missing locally are stale, and each is returned once'
);
assert.deepStrictEqual(staleExternalIds([], local), []);
assert.deepStrictEqual(staleExternalIds(cloudRows, []), ['kirana_1', 'prod1', 'prod2', 'ghost']);
assert.strictEqual(LEGACY_SEED_IDS.length, 4);

// ── The shared starter catalog ──────────────────────────────────────────────
// Every category shows the same 12 products, and every one has an image so a
// fresh catalog never renders a gray tile.
assert.strictEqual(catalogPreset.length, 12);
for (const product of catalogPreset) {
  assert.ok(product.name && product.price, `${product.id} has a name and price`);
  assert.ok(/^https?:\/\//.test(product.imageUrl || ''), `${product.id} has an image URL`);
}
assert.strictEqual(new Set(catalogPreset.map((p) => p.id)).size, 12, 'preset ids are unique');
assert.strictEqual(new Set(catalogPreset.map((p) => p.name)).size, 12, 'preset names are unique');

// ── Old per-category seed rows migrate to the shared preset ─────────────────
assert.ok(isOldPresetId('prod3'));
assert.ok(isOldPresetId('dairy_2'));
assert.ok(isOldPresetId('og_4'));
assert.ok(!isOldPresetId('kirana_1'), 'the shared preset is not an old row');
assert.ok(!isOldPresetId('prod_1690000000000'), 'a shopkeeper-added product is not a seed row');

const mixed = [
  { id: 'dairy_1', name: 'Old Dairy Seed' },
  { id: 'prod_1690000000000', name: 'My Own Item' },
];
const migrated = migratePresetCatalog(mixed, catalogPreset);
assert.strictEqual(migrated.length, 13, 'the 12 shared items replace the old seed, custom rows stay');
assert.strictEqual(migrated[0].id, 'kirana_1');
assert.ok(migrated.some((p) => p.id === 'prod_1690000000000'), 'custom product survives migration');

// A catalog already using the shared preset is returned untouched, so stock
// edits and deletions are not undone on every load.
const alreadyShared = [{ id: 'kirana_1', name: 'Maggi 2-Minute Noodles (70g)', stock: 3 }];
assert.strictEqual(migratePresetCatalog(alreadyShared, catalogPreset), alreadyShared);

// A catalog with no starter row is not touched here; the caller decides.
const customOnly = [{ id: 'prod_1', name: 'Only Mine' }];
assert.strictEqual(migratePresetCatalog(customOnly, catalogPreset), customOnly);
assert.deepStrictEqual(migratePresetCatalog([], catalogPreset), []);
assert.deepStrictEqual(migratePresetCatalog(null, catalogPreset), []);

console.log('Catalog reconcile tests passed.');
