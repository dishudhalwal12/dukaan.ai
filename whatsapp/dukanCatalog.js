import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'store');
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
    if (!query) return [];
    const q = query.toLowerCase().trim();

    return catalog.filter(p => {
      if (!p.inStock) return false;
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.category.toLowerCase().includes(q)) return true;
      if (p.keywords && p.keywords.some(k => q.includes(k) || k.includes(q))) return true;
      return false;
    });
  },

  addProduct(item) {
    const newProduct = {
      id: 'p' + Date.now(),
      name: item.name,
      category: item.category || 'General',
      price: Number(item.price) || 0,
      unit: item.unit || 'unit',
      inStock: item.inStock !== false,
      keywords: (item.keywords || []).concat(item.name.toLowerCase().split(' '))
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
  }
};
