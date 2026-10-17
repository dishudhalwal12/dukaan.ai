import { Product } from '../types.ts';

/**
 * Maps Kirana & Grocery business displayNames (stored in localStorage 'dukan-store-category')
 * → realistic branded Indian products for that category.
 * Used to seed the catalog on first launch so the inventory is relevant.
 */
export const presetProductsByDisplayName: Record<string, Product[]> = {
  'Kirana / General Store': [
    { id: 'kirana_1', name: 'Maggi 2-Minute Noodles (70g)', price: '₹15', stock: 120, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1585703900468-13c7a978ad86?w=600&h=600&fit=crop' },
    { id: 'kirana_2', name: 'Tata Salt Vaccum Evaporated (1kg)', price: '₹28', stock: 80, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1576791128879-1e6a6d2c9f71?w=600&h=600&fit=crop' },
    { id: 'kirana_3', name: 'Aashirvaad Shudh Chakki Atta (5kg)', price: '₹245', stock: 35, stockUnit: 'bags', imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop' },
    { id: 'kirana_4', name: 'Fortune Sunlite Sunflower Oil (1L)', price: '₹165', stock: 24, stockUnit: 'pouches', imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop' },
    { id: 'kirana_5', name: 'Parle-G Gold Biscuits (1kg)', price: '₹85', stock: 60, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop' },
    { id: 'kirana_6', name: 'Tata Tea Premium (500g)', price: '₹290', stock: 40, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&h=600&fit=crop' },
  ],

  'Grocery / Kirana': [
    { id: 'groc_1', name: 'Maggi 2-Minute Noodles', price: '₹15', stock: 100, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1585703900468-13c7a978ad86?w=600&h=600&fit=crop' },
    { id: 'groc_2', name: 'Amul Gold Milk (1L)', price: '₹68', stock: 30, stockUnit: 'cartons', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=600&fit=crop' },
    { id: 'groc_3', name: 'Parle-G Biscuits (800g)', price: '₹45', stock: 80, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop' },
    { id: 'groc_4', name: 'Tata Salt (1kg)', price: '₹22', stock: 60, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1576791128879-1e6a6d2c9f71?w=600&h=600&fit=crop' },
    { id: 'groc_5', name: 'Fortune Sunflower Oil (1L)', price: '₹185', stock: 18, stockUnit: 'bottles', imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop' },
    { id: 'groc_6', name: 'Colgate Max Fresh Toothpaste', price: '₹55', stock: 40, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1605492453965-9e2a4c74df4c?w=600&h=600&fit=crop' },
  ],

  'Fruits & Vegetables': [
    { id: 'fv_1', name: 'Fresh Robusta Bananas (1 Dozen)', price: '₹60', stock: 45, stockUnit: 'dozens', imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&h=600&fit=crop' },
    { id: 'fv_2', name: 'Farm Fresh Tomatoes (1kg)', price: '₹35', stock: 60, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&h=600&fit=crop' },
    { id: 'fv_3', name: 'Shimla Royal Apples (1kg)', price: '₹140', stock: 30, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600&h=600&fit=crop' },
    { id: 'fv_4', name: 'Nashik Red Onions (1kg)', price: '₹40', stock: 80, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&h=600&fit=crop' },
    { id: 'fv_5', name: 'Fresh Green Potatoes (1kg)', price: '₹30', stock: 90, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&h=600&fit=crop' },
    { id: 'fv_6', name: 'Nagpur Oranges (1kg)', price: '₹90', stock: 25, stockUnit: 'kg', imageUrl: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=600&h=600&fit=crop' },
  ],

  'Dairy & Milk Booth': [
    { id: 'dairy_1', name: 'Amul Taaza Homogenised Milk (500ml)', price: '₹27', stock: 70, stockUnit: 'packets', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=600&fit=crop' },
    { id: 'dairy_2', name: 'Mother Dairy Classic Dahi (400g)', price: '₹35', stock: 45, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop' },
    { id: 'dairy_3', name: 'Amul Pasteurized Salted Butter (100g)', price: '₹58', stock: 50, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&h=600&fit=crop' },
    { id: 'dairy_4', name: 'Fresh Malai Paneer Block (200g)', price: '₹90', stock: 30, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc0?w=600&h=600&fit=crop' },
    { id: 'dairy_5', name: 'Amul Processed Cheese Slices (200g)', price: '₹140', stock: 20, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1618164435735-413d3b066c9a?w=600&h=600&fit=crop' },
    { id: 'dairy_6', name: 'Amul Pure Cow Ghee (500ml)', price: '₹340', stock: 15, stockUnit: 'jars', imageUrl: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&h=600&fit=crop' },
  ],

  'Daily Essentials & Packaged Goods': [
    { id: 'fmcg_1', name: 'Dettol Original Germ Protection Soap (125g)', price: '₹55', stock: 90, stockUnit: 'bars', imageUrl: 'https://images.unsplash.com/photo-1605492453965-9e2a4c74df4c?w=600&h=600&fit=crop' },
    { id: 'fmcg_2', name: 'Surf Excel Easy Wash Detergent (1kg)', price: '₹140', stock: 40, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&h=600&fit=crop' },
    { id: 'fmcg_3', name: 'Colgate MaxFresh Spicy Fresh Gel (150g)', price: '₹110', stock: 55, stockUnit: 'tubes', imageUrl: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=600&h=600&fit=crop' },
    { id: 'fmcg_4', name: 'Vim Lemon Dishwash Bar (300g)', price: '₹30', stock: 110, stockUnit: 'bars', imageUrl: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&h=600&fit=crop' },
    { id: 'fmcg_5', name: 'Head & Shoulders Cool Menthol (180ml)', price: '₹180', stock: 25, stockUnit: 'bottles', imageUrl: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&h=600&fit=crop' },
    { id: 'fmcg_6', name: 'Good Knight Gold Flash Liquid Refill', price: '₹85', stock: 45, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=600&fit=crop' },
  ],

  'Other Grocery': [
    { id: 'og_1', name: 'Packaged Grocery Item 1', price: '₹50', stock: 50, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1585703900468-13c7a978ad86?w=600&h=600&fit=crop' },
    { id: 'og_2', name: 'Packaged Grocery Item 2', price: '₹100', stock: 30, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=600&fit=crop' },
    { id: 'og_3', name: 'Packaged Grocery Item 3', price: '₹150', stock: 20, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1576791128879-1e6a6d2c9f71?w=600&h=600&fit=crop' },
    { id: 'og_4', name: 'Packaged Grocery Item 4', price: '₹200', stock: 15, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop' },
  ]
};
