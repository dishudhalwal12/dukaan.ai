import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'store');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_PRODUCTS = [
  { id: 'p1', name: 'Maggi 2-Minute Noodles', category: 'Snacks', price: 15, unit: 'packet (70g)', inStock: true, keywords: ['maggi', 'maggie', 'noodles', '2-minute'] },
  { id: 'p2', name: 'Maggi Special Masala Noodles', category: 'Snacks', price: 20, unit: 'packet (70g)', inStock: true, keywords: ['maggi', 'maggie', 'masala', 'special'] },
  { id: 'p3', name: 'Maggi Atta Noodles', category: 'Snacks', price: 25, unit: 'packet (72.5g)', inStock: true, keywords: ['maggi', 'maggie', 'atta', 'wheat'] },
  { id: 'p4', name: 'Amul Taaza Milk', category: 'Dairy', price: 27, unit: '500ml pouch', inStock: true, keywords: ['milk', 'doodh', 'amul', 'taaza'] },
  { id: 'p5', name: 'Amul Butter', category: 'Dairy', price: 58, unit: '100g pack', inStock: true, keywords: ['butter', 'makhan', 'amul'] },
  { id: 'p6', name: 'Britannia White Bread', category: 'Bakery', price: 35, unit: '400g loaf', inStock: true, keywords: ['bread', 'white bread', 'britannia'] },
  { id: 'p7', name: 'Coca-Cola', category: 'Beverages', price: 45, unit: '750ml bottle', inStock: true, keywords: ['coca cola', 'coke', 'cold drink', 'soda'] },
  { id: 'p8', name: 'Thums Up', category: 'Beverages', price: 45, unit: '750ml bottle', inStock: true, keywords: ['thums up', 'thumbs up', 'coke', 'cold drink'] },
  { id: 'p9', name: 'Kurkure Masala Munch', category: 'Snacks', price: 20, unit: 'packet (85g)', inStock: true, keywords: ['kurkure', 'chips', 'namkeen', 'munch'] },
  { id: 'p10', name: 'Lay\'s Classic Salted', category: 'Snacks', price: 20, unit: 'packet (50g)', inStock: true, keywords: ['lays', 'lay\'s', 'chips', 'salted'] },
  { id: 'p11', name: 'Parle-G Biscuits', category: 'Biscuits', price: 10, unit: 'pack (130g)', inStock: true, keywords: ['parle-g', 'parleg', 'biscuit', 'chai biscuit'] },
  { id: 'p12', name: 'Good Day Butter Cookies', category: 'Biscuits', price: 20, unit: 'pack (100g)', inStock: true, keywords: ['good day', 'goodday', 'cookies', 'biscuit'] },
  { id: 'p13', name: 'Red Label Tea (Chai Patti)', category: 'Groceries', price: 110, unit: '250g pack', inStock: true, keywords: ['tea', 'chai', 'chai patti', 'red label'] },
  { id: 'p14', name: 'Tata Salt', category: 'Groceries', price: 28, unit: '1kg pack', inStock: true, keywords: ['salt', 'namak', 'tata salt'] },
  { id: 'p15', name: 'Aashirvaad Shudh Chakki Atta', category: 'Groceries', price: 245, unit: '5kg bag', inStock: true, keywords: ['atta', 'flour', 'wheat flour', 'aashirvaad'] },
  { id: 'p16', name: 'Farm Fresh Eggs', category: 'Dairy', price: 42, unit: 'pack of 6', inStock: true, keywords: ['egg', 'eggs', 'ande', 'anda'] }
];

let catalog = [];

try {
  if (fs.existsSync(CATALOG_FILE)) {
    catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  } else {
    catalog = DEFAULT_PRODUCTS;
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
  }
} catch (e) {
  catalog = DEFAULT_PRODUCTS;
}

function saveCatalog() {
  try {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
  } catch (err) {
    console.error('Failed to save catalog:', err.message);
  }
}

const KNOWN_NAME_MAP = {
  'product_maggi': 'Maggi 2-Minute Noodles',
  'product_amul_milk': 'Amul Taaza Milk',
  'product_parle_g': 'Parle-G Biscuits',
  'product_tata_salt': 'Tata Salt',
};

function getAliasesForName(name) {
  const lower = name.toLowerCase();
  const aliases = [lower];
  const clean = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  aliases.push(clean);
  clean.split(' ').filter(w => w.length > 2).forEach(w => aliases.push(w));

  if (lower.includes('parle')) {
    aliases.push('parle-g', 'parleg', 'parle g', 'biscuit', 'biscuits', 'chai biscuit');
  }
  if (lower.includes('maggi') || lower.includes('maggie')) {
    aliases.push('maggi', 'maggie', 'noodles', '2-minute');
  }
  if (lower.includes('milk') || lower.includes('amul') || lower.includes('doodh')) {
    aliases.push('milk', 'amul', 'doodh', 'taaza');
  }
  if (lower.includes('salt') || lower.includes('namak') || lower.includes('tata')) {
    aliases.push('salt', 'namak', 'tata');
  }
  if (lower.includes('good day') || lower.includes('goodday')) {
    aliases.push('good day', 'goodday', 'biscuit', 'cookies', 'butter cookies');
  }
  return Array.from(new Set(aliases));
}

/**
 * Searches ONE catalog. Pure: it reads only the array it is given, so the bot
 * can search the matched shop's catalog without touching the global one.
 * Returns the products in best-match order.
 */
export function searchInCatalog(products, query) {
  const list = Array.isArray(products) ? products : [];
  if (!query || list.length === 0) return [];
  const rawQ = query.toLowerCase().trim();
  const cleanQ = rawQ.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const allTokens = cleanQ.split(' ').filter(w => w.length > 1);

  const STOP_WORDS = new Set([
    'pack', 'packet', 'packets', 'pkt', 'pkts', 'bottle', 'bottles', 'tube', 'tubes',
    'kg', 'gm', 'g', 'l', 'ml', 'litre', 'liter',
    'chahiye', 'bhai', 'bhaiya', 'bhej', 'do', 'hai', 'kya', 'ka', 'ke', 'ki', 'ko', 'me', 'mein',
    'rate', 'bhav', 'price', 'kitne', 'kitna', 'aur', 'and', 'with', 'se', 'ek', 'do', 'teen',
    'char', 'paanch', 'only', 'sirf', 'bas', 'mang', 'rahe', 'ho', 'abhi', 'fir', 'karo', 'kar', 'yahan',
    'pehle', 'batao', 'batana', 'pucha', 'tha', 'wala', 'wali', 'wale', 'milega', 'milegi', 'hain',
    'all', 'long', 'this', 'that', 'those', 'these', 'there', 'where', 'what', 'which', 'how', 'when', 'why', 'who',
    'saves', 'save', 'saved', 'data', 'get', 'got', 'gonna', 'gotta', 'tell', 'answer', 'question',
    'type', 'names', 'name', 'list', 'bro', 'sir', 'first', 'learn', 'history', 'because', 'irritate',
    'some', 'items', 'item', 'need', 'want', 'looking', 'remove', 'stock', 'store'
  ]);

  let searchTokens = allTokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
  if (searchTokens.length === 0) return [];
  if (allTokens.length >= 3 && searchTokens.length === 1 && searchTokens[0].length <= 4) {
    // Avoid matching a whole conversational sentence on a single short incidental word
    const singleTok = searchTokens[0];
    const hasExactProduct = list.some(p => p.keywords?.includes(singleTok) || p.name.toLowerCase().split(' ').includes(singleTok));
    if (!hasExactProduct) return [];
  }

  const scored = [];

  for (const p of list) {
    if (!p.inStock) continue;
    const pNameLower = p.name.toLowerCase();
    const pClean = pNameLower.replace(/[^a-z0-9\s]/g, ' ').trim();
    const pKeywords = (p.keywords || []).map(k => k.toLowerCase());
    let score = 0;

    // Full phrase match
    if (pNameLower.includes(cleanQ) || pKeywords.includes(cleanQ)) {
      score += 100;
    }

    // Check each search token
    let matchedTokenCount = 0;
    const nameWords = pClean.split(' ');
    for (const tok of searchTokens) {
      const inNameWord = nameWords.includes(tok);
      const inKwExact = pKeywords.includes(tok) || pKeywords.some(k => k.split(/[\s-]+/).includes(tok));
      const inNameSub = pClean.includes(tok);
      const inKwSub = pKeywords.some(k => k.includes(tok));

      if (inNameWord || inKwExact) {
        matchedTokenCount++;
        if (inNameWord) score += 60;
        if (inKwExact) score += 40;
        if (pClean.startsWith(tok)) score += 20;
      } else if (tok.length >= 4 && (inNameSub || inKwSub)) {
        matchedTokenCount++;
        if (inNameSub) score += 10;
        if (inKwSub) score += 10;
      }
    }

    // Multi-token query bonus: extra weight if ALL search tokens matched
    if (searchTokens.length > 1 && matchedTokenCount === searchTokens.length) {
      score += 50;
    }

    if (score > 0 && matchedTokenCount > 0) {
      scored.push({ product: p, score, matchedTokenCount });
    }
  }

  scored.sort((a, b) => {
    if (b.matchedTokenCount !== a.matchedTokenCount) {
      return b.matchedTokenCount - a.matchedTokenCount;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.product.price - b.product.price;
  });

  return scored.map(s => s.product);
}

/**
 * Resolves a customer/model item name against ONE catalog.
 *
 * @returns {{status:'ok', product} | {status:'missing'} | {status:'ambiguous', options:product[]}}
 *
 * Never guesses: when several distinct products genuinely match (e.g. "maggi"
 * when the shop stocks three Maggi variants at different prices), the caller must
 * ask which one — ordering the wrong variant is worse than one extra question.
 */
export function resolveCatalogItem(products, rawName) {
  const list = Array.isArray(products) ? products : [];
  const q = String(rawName || '').toLowerCase().trim();
  if (!q || list.length === 0) return { status: 'missing' };

  const exact = list.find((p) => p.name.toLowerCase() === q);
  if (exact) return { status: 'ok', product: exact };

  const matches = searchInCatalog(list, rawName);
  if (matches.length === 0) return { status: 'missing' };

  const near = matches.slice(0, 3);
  const distinctNames = new Set(near.map((p) => p.name));
  if (distinctNames.size > 1 && near.length > 1 && near[0].price !== near[1].price) {
    return { status: 'ambiguous', options: near };
  }
  return { status: 'ok', product: matches[0] };
}

export const dukanCatalog = {
  getAll() {
    return catalog;
  },

  getInStock() {
    return catalog.filter(p => p.inStock);
  },

  getById(id) {
    return catalog.find(p => p.id === id);
  },

  search(query) {
    return searchInCatalog(catalog, query);
  },

  addProduct(item) {
    const rawName = String(item.name || '').trim();
    const resolvedName = KNOWN_NAME_MAP[rawName] || rawName;
    const newProduct = {
      id: 'p' + Date.now(),
      name: resolvedName,
      category: item.category || 'General',
      price: Number(item.price) || 0,
      unit: item.unit || 'unit',
      inStock: item.inStock !== false,
      keywords: getAliasesForName(resolvedName).concat(item.keywords || [])
    };
    catalog.push(newProduct);
    saveCatalog();
    return newProduct;
  },

  updateProduct(id, updates) {
    const index = catalog.findIndex(p => p.id === id);
    if (index === -1) return null;
    catalog[index] = { ...catalog[index], ...updates };
    saveCatalog();
    return catalog[index];
  },

  deleteProduct(id) {
    const index = catalog.findIndex(p => p.id === id);
    if (index === -1) return false;
    catalog.splice(index, 1);
    saveCatalog();
    return true;
  },

  reload() {
    try {
      if (fs.existsSync(CATALOG_FILE)) {
        catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      }
    } catch (e) {}
    return catalog;
  },

  syncFromStore(products) {
    if (!Array.isArray(products) || products.length === 0) return catalog;
    for (const p of products) {
      let priceNum = 0;
      if (typeof p.price === 'number') {
        priceNum = p.price;
      } else if (typeof p.price === 'string') {
        priceNum = parseFloat(p.price.replace(/[^\d.]/g, '')) || 0;
      }

      const rawName = String(p.name || '').trim();
      const resolvedName = KNOWN_NAME_MAP[rawName] || rawName;
      const aliases = getAliasesForName(resolvedName);
      if (rawName !== resolvedName) {
        aliases.push(rawName.toLowerCase());
      }

      const existingIdx = catalog.findIndex(item => item.id === p.id || item.name.toLowerCase() === resolvedName.toLowerCase());
      if (existingIdx !== -1) {
        if (priceNum > 0) catalog[existingIdx].price = priceNum;
        if (typeof p.stock === 'number') catalog[existingIdx].inStock = p.stock > 0;
        else if (p.inStock !== undefined) catalog[existingIdx].inStock = Boolean(p.inStock);
      } else {
        catalog.push({
          id: String(p.id || 'p' + Date.now()),
          name: resolvedName,
          category: p.category || 'General',
          price: priceNum,
          unit: p.stockUnit || p.unit || 'unit',
          inStock: typeof p.stock === 'number' ? p.stock > 0 : (p.inStock !== false),
          keywords: Array.from(new Set([...aliases, ...(p.keywords || [])]))
        });
      }
    }
    saveCatalog();
    return catalog;
  }
};
