import { Product } from '../types.ts';
import { TabConfig } from '../utils/tabResolver.ts';

export interface BusinessPreset {
  category: string;
  tabs: TabConfig[];
  catalogSeed: Product[];
}

export const presetRegistry: Record<string, BusinessPreset> = {
  GROCERY: {
    category: 'Grocery / Kirana',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Catalog', icon: 'inventory_2' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'prod1', name: 'product_maggi', price: '₹96', stock: 50, stockUnit: 'packs', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcR_1iA8T9T2B4zO_VtrJoSA0vQbbfxWd_2n-A&s' },
      { id: 'prod2', name: 'product_amul_milk', price: '₹68', stock: 30, stockUnit: 'cartons', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcT6y-n52J2bMMz0sA4D2HQzDXs2oKqv4i-pSQ&s' },
      { id: 'prod3', name: 'product_parle_g', price: '₹80', stock: 100, stockUnit: 'packs', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcT3Y8naCsO5Xg3A9D-M6h_3_4c-w-QjX_p4zQ&s' },
      { id: 'prod4', name: 'product_tata_salt', price: '₹28', stock: 80, stockUnit: 'packs', imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcRz-a6f9f-0J4p-W8yBf_2h2Kj9Z-J5Gq8r-g&s' },
    ]
  },
  RESTAURANT: {
    category: 'Restaurant / Cafe',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Menu', icon: 'menu_book' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'rest1', name: 'Butter Chicken', price: '₹350', stock: 40, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae39f?w=600&h=600&fit=crop' },
      { id: 'rest2', name: 'Paneer Tikka', price: '₹280', stock: 25, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1599487405620-8e10696515b2?w=600&h=600&fit=crop' },
      { id: 'rest3', name: 'Garlic Naan', price: '₹60', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc0?w=600&h=600&fit=crop' },
      { id: 'rest4', name: 'Dal Makhani', price: '₹220', stock: 30, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=600&fit=crop' },
    ]
  },
  CAFE: {
    category: 'Cafe',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Menu', icon: 'local_cafe' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'cafe1', name: 'Cappuccino', price: '₹150', stock: 60, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67efec?w=600&h=600&fit=crop' },
      { id: 'cafe2', name: 'Iced Latte', price: '₹180', stock: 45, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&h=600&fit=crop' },
      { id: 'cafe3', name: 'Chocolate Croissant', price: '₹120', stock: 20, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1549903072-7e6e0d65bd0f?w=600&h=600&fit=crop' },
      { id: 'cafe4', name: 'Blueberry Muffin', price: '₹90', stock: 15, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600&h=600&fit=crop' },
    ]
  },
  SALON: {
    category: 'Salon / Spa',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Appointments', icon: 'calendar_month' },
      { key: 'CATALOG', label: 'Services', icon: 'content_cut' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'salon1', name: 'Men\'s Haircut', price: '₹250', stock: 10, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1582095133179-bfd08e2f108c?w=600&h=600&fit=crop' },
      { id: 'salon2', name: 'Women\'s Haircut', price: '₹600', stock: 8, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop' },
      { id: 'salon3', name: 'Beard Trim', price: '₹150', stock: 15, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600&h=600&fit=crop' },
      { id: 'salon4', name: 'Basic Facial', price: '₹800', stock: 5, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1570172619644-defd8820bd28?w=600&h=600&fit=crop' },
    ]
  },
  CHEMIST: {
    category: 'Chemist / Pharmacy',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Medicines', icon: 'medication' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'phar1', name: 'Paracetamol 500mg', price: '₹15', stock: 200, stockUnit: 'strips', imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=600&fit=crop' },
      { id: 'phar2', name: 'Cough Syrup', price: '₹120', stock: 45, stockUnit: 'bottles', imageUrl: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=600&h=600&fit=crop' },
      { id: 'phar3', name: 'Band-Aid Box', price: '₹50', stock: 60, stockUnit: 'boxes', imageUrl: 'https://images.unsplash.com/photo-1628043689369-0268ec387063?w=600&h=600&fit=crop' },
      { id: 'phar4', name: 'Vitamin C Tablets', price: '₹85', stock: 120, stockUnit: 'strips', imageUrl: 'https://images.unsplash.com/photo-1550572017-edb7df02434e?w=600&h=600&fit=crop' },
    ]
  },
  ELECTRONICS: {
    category: 'Electronics Store',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Products', icon: 'devices' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'elec1', name: 'USB-C Fast Charger', price: '₹499', stock: 80, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1583095126300-843e9fa80290?w=600&h=600&fit=crop' },
      { id: 'elec2', name: 'Wireless Earbuds', price: '₹1299', stock: 40, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&h=600&fit=crop' },
      { id: 'elec3', name: 'Power Bank 10000mAh', price: '₹899', stock: 55, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&h=600&fit=crop' },
      { id: 'elec4', name: 'Tempered Glass Guard', price: '₹150', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1541560052-5e137f229371?w=600&h=600&fit=crop' },
    ]
  },
  CLOTHING: {
    category: 'Clothing Boutique',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Apparel', icon: 'checkroom' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'cloth1', name: 'Cotton T-Shirt (M)', price: '₹399', stock: 45, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=600&fit=crop' },
      { id: 'cloth2', name: 'Denim Jeans (32)', price: '₹999', stock: 25, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop' },
      { id: 'cloth3', name: 'Party Wear Gown', price: '₹2499', stock: 10, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=600&h=600&fit=crop' },
      { id: 'cloth4', name: 'Formal Shirt (L)', price: '₹799', stock: 30, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e32f85e2c?w=600&h=600&fit=crop' },
    ]
  },
  HARDWARE: {
    category: 'Hardware Store',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Tools', icon: 'handyman' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'hard1', name: 'Claw Hammer', price: '₹250', stock: 30, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=600&fit=crop' },
      { id: 'hard2', name: 'Acrylic Washable Paint 1L', price: '₹450', stock: 40, stockUnit: 'cans', imageUrl: 'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=600&h=600&fit=crop' },
      { id: 'hard3', name: 'LED Bulb 9W', price: '₹95', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1546206126-7ad131828cb3?w=600&h=600&fit=crop' },
      { id: 'hard4', name: 'Wrench Kit (12pcs)', price: '₹850', stock: 15, stockUnit: 'kits', imageUrl: 'https://images.unsplash.com/photo-1493033575916-2fd74fe8dd49?w=600&h=600&fit=crop' },
    ]
  }
};
