/**
 * Pure catalog helpers for the MCP server.
 *
 * Prices are handled in integer paise end-to-end so a float never decides what a
 * customer is charged. The display string is generated from the same integer.
 */

/** Merchant-entered text is data, never instructions. */
export function sanitiseCatalogText(value, max = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const ALIASES = {
  milk: ['doodh', 'dudh', 'taaza', 'taza'],
  curd: ['dahi', 'yogurt', 'yoghurt'],
  bread: ['pav', 'double roti'],
  egg: ['eggs', 'anda', 'ande'],
  salt: ['namak'],
  noodles: ['maggi', 'maggie'],
  biscuit: ['biscuits', 'parle', 'cookie', 'cookies'],
  rice: ['chawal', 'chaval'],
  flour: ['atta', 'aata'],
  sugar: ['cheeni', 'chini'],
  oil: ['tel', 'tel'],
  tea: ['chai', 'patti'],
};

/** Lowercase, collapse whitespace, strip punctuation that carries no meaning. */
export function normaliseQuery(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses a catalog price string into integer paise, or null when unusable. */
export function parsePriceToPaise(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && (!Number.isFinite(raw) || raw <= 0)) return null;
  const text = String(raw).trim();
  if (/^-\s*\d/.test(text)) return null;
  const cleaned = text.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const rupees = Number.parseFloat(cleaned);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

/** Formats integer paise as a rupee string: 2700 → ₹27, 2750 → ₹27.50. */
export function formatRupees(paise) {
  if (!Number.isFinite(paise) || paise < 0) return '';
  const whole = Math.floor(paise / 100);
  const fraction = paise % 100;
  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(whole);
  return fraction === 0 ? `₹${grouped}` : `₹${grouped}.${String(fraction).padStart(2, '0')}`;
}

/** Maps a Supabase `products` row to the public MCP product shape. */
export function toPublicProduct(row) {
  if (!row || typeof row !== 'object') return null;
  const name = sanitiseCatalogText(row.name);
  if (!name) return null;

  const pricePaise = parsePriceToPaise(row.price);
  if (pricePaise === null) return null;

  const attributes = row.attributes && typeof row.attributes === 'object' ? row.attributes : {};
  const stock = row.stock;
  const inStock = stock === null || stock === undefined ? row.in_stock !== false : Number(stock) > 0;

  return {
    productId: String(row.external_id ?? row.product_id ?? row.id ?? name),
    name,
    pricePaise,
    price: formatRupees(pricePaise),
    unit: sanitiseCatalogText(row.stock_unit ?? row.unit ?? 'unit', 40),
    category: sanitiseCatalogText(attributes.category ?? row.category ?? 'General', 60),
    stock: stock === null || stock === undefined ? null : Number(stock),
    imageUrl: row.image_url ?? row.imageUrl ?? null,
    inStock,
  };
}

/** Expands a query token through the small English/Hindi grocery alias map. */
function expandToken(token) {
  const out = new Set([token]);
  for (const [english, aliases] of Object.entries(ALIASES)) {
    if (token === english || aliases.includes(token)) {
      out.add(english);
      for (const alias of aliases) out.add(alias);
    }
  }
  return [...out];
}

/**
 * Scores one product against a normalised query. 0 means no match.
 * Name exact > name prefix > name token > category > alias hit.
 */
export function scoreProduct(product, query) {
  const q = normaliseQuery(query);
  if (!q) return 1;

  const name = normaliseQuery(product?.name);
  const category = normaliseQuery(product?.category);
  if (!name) return 0;

  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;

  const tokens = q.split(' ').filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    const expanded = expandToken(token);
    const hit = expanded.some((word) => name.includes(word) || category.includes(word));
    if (!hit) return 0;
    score += token === q ? 20 : 15;
  }
  return score;
}

/**
 * Searches a shop's catalog. An empty query lists the catalog in its stored
 * order; otherwise results are ranked by score, then in-stock first, then name.
 */
export function searchCatalog(products, query, limit = 20) {
  const list = (Array.isArray(products) ? products : []).filter(Boolean);
  const q = normaliseQuery(query);
  const capped = Math.max(1, Math.min(Number(limit) || 20, 50));

  if (!q) return list.slice(0, capped);

  return list
    .map((product) => ({ product, score: scoreProduct(product, q) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.product.inStock) - Number(a.product.inStock) ||
        a.product.name.localeCompare(b.product.name)
    )
    .slice(0, capped)
    .map((entry) => entry.product);
}
