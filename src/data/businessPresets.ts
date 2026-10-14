export interface BusinessPreset {
  key: string;
  displayName: string;
  icon: string;
  catalogSeed: {
    name: string;
    price: number;
    stock: number;
    unit: string;
  }[];
}

export const businessPresets: BusinessPreset[] = [
  {
    key: "grocery",
    displayName: "Grocery / Kirana",
    icon: "local_grocery_store",
    catalogSeed: [
      { name: "Maggi Noodles", price: 15, stock: 100, unit: "packs" },
      { name: "Amul Milk (500ml)", price: 33, stock: 40, unit: "packets" },
      { name: "Parle-G Biscuit", price: 10, stock: 150, unit: "packs" },
      { name: "Tata Salt (1kg)", price: 28, stock: 60, unit: "packs" },
    ]
  },
  {
    key: "restaurant",
    displayName: "Restaurant",
    icon: "restaurant",
    catalogSeed: [
      { name: "Butter Chicken", price: 350, stock: 40, unit: "portions" },
      { name: "Paneer Tikka", price: 280, stock: 25, unit: "portions" },
      { name: "Garlic Naan", price: 60, stock: 150, unit: "pcs" },
      { name: "Dal Makhani", price: 220, stock: 30, unit: "portions" },
    ]
  },
  {
    key: "cafe",
    displayName: "Cafe",
    icon: "local_cafe",
    catalogSeed: [
      { name: "Cappuccino", price: 150, stock: 60, unit: "cups" },
      { name: "Iced Latte", price: 180, stock: 45, unit: "cups" },
      { name: "Chocolate Croissant", price: 120, stock: 20, unit: "pcs" },
      { name: "Blueberry Muffin", price: 90, stock: 15, unit: "pcs" },
    ]
  },
  {
    key: "salon",
    displayName: "Salon",
    icon: "content_cut",
    catalogSeed: [
      { name: "Haircut", price: 300, stock: 50, unit: "service" },
      { name: "Beard Trim", price: 150, stock: 50, unit: "service" },
      { name: "Hair Spa", price: 800, stock: 30, unit: "service" },
      { name: "Hair Color", price: 1200, stock: 20, unit: "service" }
    ]
  },
  {
    key: "pharmacy",
    displayName: "Pharmacy",
    icon: "local_pharmacy",
    catalogSeed: [
      { name: "Paracetamol 500mg", price: 15, stock: 200, unit: "strips" },
      { name: "Cough Syrup", price: 120, stock: 45, unit: "bottles" },
      { name: "Band-Aid Box", price: 50, stock: 60, unit: "boxes" },
      { name: "Vitamin C Tablets", price: 85, stock: 120, unit: "strips" }
    ]
  },
  {
    key: "electronics",
    displayName: "Electronics",
    icon: "devices",
    catalogSeed: [
      { name: "USB-C Fast Charger", price: 499, stock: 80, unit: "pcs" },
      { name: "Wireless Earbuds", price: 1299, stock: 40, unit: "pcs" },
      { name: "Power Bank 10000mAh", price: 899, stock: 55, unit: "pcs" },
      { name: "Tempered Glass Guard", price: 150, stock: 150, unit: "pcs" }
    ]
  },
  {
    key: "clothing",
    displayName: "Clothing",
    icon: "checkroom",
    catalogSeed: [
      { name: "Cotton T-Shirt (M)", price: 399, stock: 45, unit: "pcs" },
      { name: "Denim Jeans (32)", price: 999, stock: 25, unit: "pcs" },
      { name: "Party Wear Gown", price: 2499, stock: 10, unit: "pcs" },
      { name: "Formal Shirt (L)", price: 799, stock: 30, unit: "pcs" }
    ]
  },
  {
    key: "hardware",
    displayName: "Hardware",
    icon: "handyman",
    catalogSeed: [
      { name: "Claw Hammer", price: 250, stock: 30, unit: "pcs" },
      { name: "Washable Paint 1L", price: 450, stock: 40, unit: "cans" },
      { name: "LED Bulb 9W", price: 95, stock: 150, unit: "pcs" },
      { name: "Wrench Kit (12pcs)", price: 850, stock: 15, unit: "kits" }
    ]
  }
];
