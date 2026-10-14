import { Product } from '../types.ts';

/**
 * Maps business displayName (stored in localStorage 'dukan-store-category')
 * → 6 realistic branded Indian products for that business type.
 * Used to seed the catalog on first launch so the inventory is relevant.
 */
export const presetProductsByDisplayName: Record<string, Product[]> = {
  'Grocery / Kirana': [
    { id: 'groc_1', name: 'Maggi 2-Minute Noodles', price: '₹15', stock: 100, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1585703900468-13c7a978ad86?w=600&h=600&fit=crop' },
    { id: 'groc_2', name: 'Amul Gold Milk (1L)', price: '₹68', stock: 30, stockUnit: 'cartons', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=600&fit=crop' },
    { id: 'groc_3', name: 'Parle-G Biscuits (800g)', price: '₹45', stock: 80, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop' },
    { id: 'groc_4', name: 'Tata Salt (1kg)', price: '₹22', stock: 60, stockUnit: 'packs', imageUrl: 'https://images.unsplash.com/photo-1576791128879-1e6a6d2c9f71?w=600&h=600&fit=crop' },
    { id: 'groc_5', name: 'Fortune Sunflower Oil (1L)', price: '₹185', stock: 18, stockUnit: 'bottles', imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop' },
    { id: 'groc_6', name: 'Colgate Max Fresh Toothpaste', price: '₹55', stock: 40, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1605492453965-9e2a4c74df4c?w=600&h=600&fit=crop' },
  ],

  'Restaurant': [
    { id: 'rest_1', name: 'Butter Chicken', price: '₹350', stock: 40, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae39f?w=600&h=600&fit=crop' },
    { id: 'rest_2', name: 'Paneer Tikka', price: '₹280', stock: 25, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1599487405620-8e10696515b2?w=600&h=600&fit=crop' },
    { id: 'rest_3', name: 'Garlic Naan', price: '₹60', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc0?w=600&h=600&fit=crop' },
    { id: 'rest_4', name: 'Dal Makhani', price: '₹220', stock: 30, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=600&fit=crop' },
    { id: 'rest_5', name: 'Veg Fried Rice', price: '₹180', stock: 35, stockUnit: 'portions', imageUrl: 'https://images.unsplash.com/photo-1512058556646-c4da40fba323?w=600&h=600&fit=crop' },
    { id: 'rest_6', name: 'Mango Lassi', price: '₹80', stock: 50, stockUnit: 'glasses', imageUrl: 'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=600&h=600&fit=crop' },
  ],

  'Cafe': [
    { id: 'cafe_1', name: 'Cappuccino', price: '₹150', stock: 60, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67efec?w=600&h=600&fit=crop' },
    { id: 'cafe_2', name: 'Iced Latte', price: '₹180', stock: 45, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&h=600&fit=crop' },
    { id: 'cafe_3', name: 'Chocolate Croissant', price: '₹120', stock: 20, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1549903072-7e6e0d65bd0f?w=600&h=600&fit=crop' },
    { id: 'cafe_4', name: 'Blueberry Muffin', price: '₹90', stock: 15, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600&h=600&fit=crop' },
    { id: 'cafe_5', name: 'Cold Brew Coffee', price: '₹200', stock: 12, stockUnit: 'cups', imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&h=600&fit=crop' },
    { id: 'cafe_6', name: 'Cheese Sandwich', price: '₹140', stock: 25, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=600&h=600&fit=crop' },
  ],

  'Salon': [
    { id: 'salon_1', name: "Men's Haircut", price: '₹250', stock: 20, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1582095133179-bfd08e2f108c?w=600&h=600&fit=crop' },
    { id: 'salon_2', name: "Women's Haircut & Styling", price: '₹600', stock: 15, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop' },
    { id: 'salon_3', name: 'Beard Trim & Shaping', price: '₹150', stock: 25, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600&h=600&fit=crop' },
    { id: 'salon_4', name: 'L\'Oreal Hair Color', price: '₹1200', stock: 12, stockUnit: 'sessions', imageUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&h=600&fit=crop' },
    { id: 'salon_5', name: 'VLCC Basic Facial', price: '₹800', stock: 8, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1570172619644-defd8820bd28?w=600&h=600&fit=crop' },
    { id: 'salon_6', name: 'Manicure & Pedicure', price: '₹600', stock: 10, stockUnit: 'slots', imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&h=600&fit=crop' },
  ],

  'Pharmacy': [
    { id: 'phar_1', name: 'Crocin Tablet (500mg)', price: '₹15', stock: 200, stockUnit: 'strips', imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=600&fit=crop' },
    { id: 'phar_2', name: 'Dolo 650mg', price: '₹30', stock: 150, stockUnit: 'strips', imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=600&fit=crop' },
    { id: 'phar_3', name: 'Vicks VapoRub (50ml)', price: '₹105', stock: 60, stockUnit: 'bottles', imageUrl: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=600&h=600&fit=crop' },
    { id: 'phar_4', name: 'Band-Aid Assorted (Pack)', price: '₹60', stock: 80, stockUnit: 'boxes', imageUrl: 'https://images.unsplash.com/photo-1628043689369-0268ec387063?w=600&h=600&fit=crop' },
    { id: 'phar_5', name: 'Himalaya Face Wash', price: '₹160', stock: 35, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=600&fit=crop' },
    { id: 'phar_6', name: 'Vitamin C 1000mg (60 tabs)', price: '₹220', stock: 25, stockUnit: 'strips', imageUrl: 'https://images.unsplash.com/photo-1550572017-edb7df02434e?w=600&h=600&fit=crop' },
  ],

  'Electronics': [
    { id: 'elec_1', name: 'boAt Airdopes 141 Earbuds', price: '₹1299', stock: 20, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&h=600&fit=crop' },
    { id: 'elec_2', name: 'Ambrane 10000mAh Power Bank', price: '₹999', stock: 15, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&h=600&fit=crop' },
    { id: 'elec_3', name: 'USB Type-C Fast Charger 65W', price: '₹599', stock: 40, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1583095126300-843e9fa80290?w=600&h=600&fit=crop' },
    { id: 'elec_4', name: 'Tempered Glass Guard (Pack of 2)', price: '₹99', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1541560052-5e137f229371?w=600&h=600&fit=crop' },
    { id: 'elec_5', name: 'Philips LED Bulb 9W', price: '₹85', stock: 60, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=600&h=600&fit=crop' },
    { id: 'elec_6', name: 'Mi Smart Speaker', price: '₹2499', stock: 8, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1543512214-318c7553f230?w=600&h=600&fit=crop' },
  ],

  'Clothing': [
    { id: 'cloth_1', name: 'Cotton T-Shirt (M)', price: '₹499', stock: 45, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=600&fit=crop' },
    { id: 'cloth_2', name: 'Denim Jeans (32)', price: '₹1299', stock: 20, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop' },
    { id: 'cloth_3', name: 'Printed Kurti (M)', price: '₹799', stock: 30, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=600&h=600&fit=crop' },
    { id: 'cloth_4', name: 'Formal Shirt (L)', price: '₹899', stock: 25, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e32f85e2c?w=600&h=600&fit=crop' },
    { id: 'cloth_5', name: 'Cotton Saree (Handloom)', price: '₹1599', stock: 10, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=600&h=600&fit=crop' },
    { id: 'cloth_6', name: 'Sports Jogger Pants', price: '₹699', stock: 18, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1617952236317-0bd127407984?w=600&h=600&fit=crop' },
  ],

  'Hardware': [
    { id: 'hard_1', name: 'Claw Hammer (500g)', price: '₹250', stock: 30, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=600&fit=crop' },
    { id: 'hard_2', name: 'Taparia Screwdriver Set (8pcs)', price: '₹280', stock: 20, stockUnit: 'sets', imageUrl: 'https://images.unsplash.com/photo-1493033575916-2fd74fe8dd49?w=600&h=600&fit=crop' },
    { id: 'hard_3', name: 'Philips LED Bulb 9W', price: '₹95', stock: 150, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1546206126-7ad131828cb3?w=600&h=600&fit=crop' },
    { id: 'hard_4', name: 'Asian Paints Tractor Emulsion (1L)', price: '₹450', stock: 25, stockUnit: 'cans', imageUrl: 'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=600&h=600&fit=crop' },
    { id: 'hard_5', name: 'Godrej Door Lock', price: '₹550', stock: 12, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop' },
    { id: 'hard_6', name: 'Supreme PVC Pipe (3m)', price: '₹180', stock: 40, stockUnit: 'pcs', imageUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&h=600&fit=crop' },
  ],
};
