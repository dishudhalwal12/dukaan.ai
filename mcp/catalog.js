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
  // Personal care: the shelf word only. Brand names are deliberately NOT here:
  // the nearby query ORs every token with ILIKE, so adding "dettol" to "soap"
  // would return Dettol handwash, and "paste" would return tomato paste. Brand
  // misspellings are handled by the bounded edit distance in scoreProduct, which
  // compares whole words inside one shop's catalog.
  soap: ['sabun', 'sope'],
  detergent: ['washing powder', 'detergent powder'],
  toothpaste: ['manjan', 'dant manjan'],
  shampoo: ['sampoo'],
  'sanitary pad': ['sanitary napkin', 'napkin'],
  'dishwash bar': ['bartan bar', 'dish wash'],
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

/**
 * One unit vocabulary. "units", "unit", and "" all mean the same shelf item; a
 * customer reading "Lifeboy Soap — ₹40 / units" reads a typo.
 */
const UNIT_ALIASES = {
  unit: 'unit', units: 'unit', item: 'item', items: 'item',
  pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
  bar: 'bar', bars: 'bar', box: 'box', boxes: 'box',
  bottle: 'bottle', bottles: 'bottle', pouch: 'pouch', pouches: 'pouch',
  tube: 'tube', tubes: 'tube', carton: 'carton', cartons: 'carton',
  bag: 'bag', bags: 'bag', kg: 'kg', g: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', ml: 'ml',
};

export function normaliseUnit(unit) {
  const key = String(unit ?? '').trim().toLowerCase();
  if (!key) return 'item';
  return UNIT_ALIASES[key] || key;
}

const PACK_UNIT_WORDS = 'pack|packs|packet|packets|piece|pieces|pc|pcs|unit|units|bar|bars|item|items|box|boxes|bottle|bottles';
const PACK_PATTERN = new RegExp(`\\b(\\d{1,2})\\s*(?:x\\s*)?(?:${PACK_UNIT_WORDS})\\b`);
const PACK_X_PATTERN = /\bx\s?(\d{1,2})\b/;

/**
 * "lifeboy 2 pack" -> 2. Sizes are not pack counts: "500g atta" returns null so a
 * weight never becomes a quantity.
 */
export function parsePackSize(query) {
  const text = normaliseQuery(query);
  if (!text) return null;
  const match = PACK_PATTERN.exec(text) || PACK_X_PATTERN.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 1 && count <= 20 ? count : null;
}

const PLACEHOLDER_HOSTS = [
  'via.placeholder.com', 'placeholder.com', 'placehold.co', 'placehold.it',
  'dummyimage.com', 'lorempixel.com', 'fakeimg.pl',
];

/** A placeholder is worse than no image: the card shows a grey box with "No Image". */
export function isPlaceholderImage(url) {
  const value = String(url ?? '').trim().toLowerCase();
  if (!value) return false;
  return PLACEHOLDER_HOSTS.some((host) => value.includes(host));
}


/**
 * Goods OpenAI's plugin guidelines do not allow a listing to sell, plus the
 * categories a kirana can end up with by accident. A blocked row is dropped
 * before it is scored, so it can never appear in a tool result or a card.
 *
 * The list is deliberately short and word-boundary anchored: blocking every
 * string that contains "rum" would remove "Rumali Roti".
 */
const PROHIBITED_PATTERNS = [
  /\b(cigarettes?|cigars?|bidi|beedi|gutkha|khaini|zarda|pan masala|tobacco|nicotine|vape|vaping|e-?liquid|hookah|sheesha)\b/i,
  /\b(beer|wine|whisky|whiskey|vodka|rum|gin|liquor|alcohol|breezer|toddy)\b/i,
  /\b(prescription|antibiotics?|insulin|opioids?|tramadol|codeine|sildenafil|viagra|ozempic|morphine)\b/i,
];

/** True when a product name is on the prohibited list. */
export function isProhibitedProduct(name) {
  const text = String(name ?? '');
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

/** Maps a Supabase `products` row to the public MCP product shape. */
export function toPublicProduct(row) {
  if (!row || typeof row !== 'object') return null;
  const name = sanitiseCatalogText(row.name);
  if (!name) return null;
  if (isProhibitedProduct(name)) return null;

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
    unit: normaliseUnit(sanitiseCatalogText(row.stock_unit ?? row.unit ?? 'unit', 40)),
    category: sanitiseCatalogText(attributes.category ?? row.category ?? 'General', 60),
    stock: stock === null || stock === undefined ? null : Number(stock),
    // A placeholder URL renders as "No Image" in the checkout card; null is
    // honest and lets the card use its own empty state.
    imageUrl: isPlaceholderImage(row.image_url ?? row.imageUrl) ? null : (row.image_url ?? row.imageUrl ?? null),
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

/** Levenshtein with an early exit once the budget is exceeded. */
function editDistance(a, b, budget) {
  if (Math.abs(a.length - b.length) > budget) return budget + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > budget) return budget + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * "soop" -> "soap", "lifebuoy" -> "lifeboy". Budget grows with the word length so
 * a short word cannot swallow a different short word.
 */
function fuzzyWordHit(word, text) {
  const haystack = normaliseQuery(text);
  if (!haystack) return false;
  const budget = word.length <= 5 ? 1 : 2;
  return haystack.split(' ').some((candidate) => editDistance(word, candidate, budget) <= budget);
}

/**
 * Scores one product against a normalised query. 0 means no match.
 * Name exact > name prefix > name token > category/alias hit > fuzzy hit.
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

  // "2 pack of soap" is a quantity and a filler; only "soap" describes the item.
  const tokens = q.split(' ').filter((token) => token && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
  if (tokens.length === 0) return 1;

  let score = 0;
  for (const token of tokens) {
    const expanded = expandToken(token);
    const hit = expanded.some((word) => name.includes(word) || category.includes(word));
    if (hit) {
      score += token === q ? 20 : 15;
      continue;
    }
    // Nothing matched literally: allow one typo before giving up, but never turn
    // an unrelated word into a product.
    if (fuzzyWordHit(token, name) || fuzzyWordHit(token, category)) {
      score += 5;
      continue;
    }
    return 0;
  }
  return score;
}

/**
 * Searches a shop's catalog. An empty query lists the catalog in its stored
 * order; otherwise results are ranked by score, then in-stock first, then name.
 */
/** Words that carry no product meaning; "2 pack of soap" -> "soap". */
const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'me', 'my', 'please', 'pack', 'packs', 'packet', 'packets', 'and', 'to', 'want', 'buy']);

/**
 * The token set handed to the nearby-product query.
 *
 * Aliases are OR'ed (soap OR sabun), because they name the same shelf item. The
 * SQL matcher therefore uses ANY-match; the caller ranks inside a shop with
 * `searchCatalog`, which can score a multi-word query sensibly.
 */
export function expandQueryTokens(query, max = 8) {
  const words = normaliseQuery(query)
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  const tokens = new Set(words);
  for (const word of words) {
    for (const alias of expandToken(word)) tokens.add(alias);
  }
  // Two letters is noise: "so" would ILIKE-match soap, sooji, soda and sona.
  return [...tokens].filter((token) => token.length > 2).slice(0, max);
}

/** 2 = comfortably in stock, 1 = low, 0 = unknown/sold out. */
function stockReliability(product) {
  const stock = Number(product?.stock);
  if (!Number.isFinite(stock)) return 1; // unknown stock still beats a known zero
  if (stock <= 0) return 0;
  return stock > 3 ? 2 : 1;
}

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
        // Among equal matches, the shop that can actually fulfil wins: two bars
        // left is not the shelf to send a customer to when the next shop has 40.
        stockReliability(b.product) - stockReliability(a.product) ||
        a.product.name.localeCompare(b.product.name)
    )
    .slice(0, capped)
    .map((entry) => entry.product);
}
