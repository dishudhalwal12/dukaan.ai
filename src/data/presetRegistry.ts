// [MULTI-BUSINESS] Unused: nothing imports this file (grep for `presetRegistry` finds no
// consumers). Kept as reference for the multi-business expansion — safe to delete once
// the preset catalogue is reworked.
import { Product } from '../types.ts';
import { TabConfig } from '../utils/tabResolver.ts';

export interface BusinessPreset {
  category: string;
  tabs: TabConfig[];
  catalogSeed: Product[];
}

export const presetRegistry: Record<string, BusinessPreset> = {
  GROCERY: {
    category: 'Kirana / General Store',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Catalog', icon: 'local_grocery_store' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'prod1', name: 'Maggi 2-Minute Noodles', price: '₹15', stock: 120, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1585703900468-13c7a978ad86?w=600&h=600&fit=crop' },
      { id: 'prod2', name: 'Tata Salt (1kg)', price: '₹28', stock: 80, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1576791128879-1e6a6d2c9f71?w=600&h=600&fit=crop' },
      { id: 'prod3', name: 'Aashirvaad Shudh Chakki Atta (5kg)', price: '₹245', stock: 35, stockUnit: 'bags', imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop' },
      { id: 'prod4', name: 'Fortune Sunlite Refined Oil (1L)', price: '₹165', stock: 25, stockUnit: 'pouches', imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop' },
    ]
  },
  FRUITS_VEGETABLES: {
    category: 'Fruits & Vegetables',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Produce', icon: 'nutrition' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'fv1', name: 'Fresh Bananas (1 Dozen)', price: '₹60', stock: 45, stockUnit: 'dozens', imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&h=600&fit=crop' },
      { id: 'fv2', name: 'Farm Fresh Tomatoes (1kg)', price: '₹35', stock: 60, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&h=600&fit=crop' },
      { id: 'fv3', name: 'Shimla Royal Apples (1kg)', price: '₹140', stock: 30, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&h=600&fit=crop' },
      { id: 'fv4', name: 'Nashik Red Onions (1kg)', price: '₹40', stock: 80, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&h=600&fit=crop' },
    ]
  },
  DAIRY: {
    category: 'Dairy & Milk Booth',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Dairy', icon: 'water_drop' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'dairy1', name: 'Amul Taaza Milk (500ml)', price: '₹27', stock: 70, stockUnit: 'packets', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=600&fit=crop' },
      { id: 'dairy2', name: 'Mother Dairy Classic Dahi (400g)', price: '₹35', stock: 45, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop' },
      { id: 'dairy3', name: 'Amul Butter (100g)', price: '₹58', stock: 50, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&h=600&fit=crop' },
      { id: 'dairy4', name: 'Fresh Paneer (200g)', price: '₹90', stock: 30, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc0?w=600&h=600&fit=crop' },
    ]
  },
  FMCG: {
    category: 'Daily Essentials & Packaged Goods',
    tabs: [
      { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
      { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
      { key: 'ORDERS', label: 'Orders', icon: 'receipt_long' },
      { key: 'CATALOG', label: 'Catalog', icon: 'shopping_basket' },
      { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
    ],
    catalogSeed: [
      { id: 'fmcg1', name: 'Dettol Original Soap (125g)', price: '₹55', stock: 90, stockUnit: 'bars', imageUrl: 'https://images.unsplash.com/photo-1605492453965-9e2a4c74df4c?w=600&h=600&fit=crop' },
      { id: 'fmcg2', name: 'Surf Excel Easy Wash (1kg)', price: '₹140', stock: 40, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&h=600&fit=crop' },
      { id: 'fmcg3', name: 'Colgate MaxFresh Spicy Fresh (150g)', price: '₹110', stock: 55, stockUnit: 'tubes', imageUrl: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=600&h=600&fit=crop' },
      { id: 'fmcg4', name: 'Vim Dishwash Bar (300g)', price: '₹30', stock: 110, stockUnit: 'bars', imageUrl: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&h=600&fit=crop' },
    ]
  }
};
