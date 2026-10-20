/**
 * Catalog cleanup shared by the app and its tests.
 *
 * Older builds seeded four products with ids `prod1`–`prod4` and i18n keys as
 * names. The preset catalogs use literal names, so the legacy rows survive as
 * duplicates and render in whichever language the app is set to. They are safe
 * to drop once a preset seed is in use.
 */
export const LEGACY_SEED_IDS = Object.freeze(['prod1', 'prod2', 'prod3', 'prod4']);

/**
 * Ids used by the old per-category starter catalogs (and the legacy seed).
 * Those rows are starter data, not the shopkeeper's own products, so they can
 * be replaced when the single shared preset takes over.
 */
export function isOldPresetId(id) {
  const value = String(id ?? '').trim();
  return /^(?:groc_|fv_|dairy_|fmcg_|og_)/.test(value) || LEGACY_SEED_IDS.includes(value);
}

/**
 * Replaces old starter rows with the shared preset while keeping anything the
 * shopkeeper added themselves.
 *
 * Only a catalog that still contains an old starter id is migrated: a catalog
 * already made of the shared preset, or one the shopkeeper has edited down, is
 * returned untouched so deletions are not undone on every load.
 */
export function migratePresetCatalog(products, preset, isOldId = isOldPresetId) {
  if (!Array.isArray(products) || products.length === 0) return Array.isArray(products) ? products : [];
  if (!products.some((product) => product && isOldId(product.id))) return products;

  const custom = products.filter((product) => product && !isOldId(product.id));
  return [...(Array.isArray(preset) ? preset : []), ...custom];
}

/**
 * Removes legacy seed rows, repeated ids, and exact duplicate names.
 *
 * @param {Array<{id?: string, name?: string}>} products
 * @param {{ dropLegacySeed?: boolean }} [options]
 */
export function reconcileCatalog(products, { dropLegacySeed = false } = {}) {
  if (!Array.isArray(products)) return [];

  const legacy = new Set(LEGACY_SEED_IDS);
  const seenIds = new Set();
  const seenNames = new Set();
  const cleaned = [];

  for (const product of products) {
    if (!product || typeof product !== 'object') continue;

    const id = String(product.id ?? '').trim();
    const name = String(product.name ?? '').trim();
    if (!id || !name) continue;
    if (dropLegacySeed && legacy.has(id)) continue;
    if (seenIds.has(id)) continue;

    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;

    seenIds.add(id);
    seenNames.add(nameKey);
    cleaned.push(product);
  }

  return cleaned;
}

/**
 * Cloud rows whose external id is no longer in the local catalog.
 *
 * The bot reads the `products` table directly, so removals have to be mirrored
 * there too — an upsert alone leaves the deleted product orderable.
 *
 * @param {Array<{external_id?: string}>} cloudRows
 * @param {Array<{id?: string}>} products
 */
export function staleExternalIds(cloudRows, products) {
  const localIds = new Set(
    (Array.isArray(products) ? products : [])
      .map((product) => String(product?.id ?? '').trim())
      .filter(Boolean)
  );

  const stale = [];
  const seen = new Set();

  for (const row of Array.isArray(cloudRows) ? cloudRows : []) {
    const id = String(row?.external_id ?? '').trim();
    if (!id || localIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    stale.push(id);
  }

  return stale;
}
