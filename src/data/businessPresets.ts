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
    displayName: "Kirana / General Store",
    icon: "local_grocery_store",
    catalogSeed: [
      { name: "Maggi 2-Minute Noodles", price: 15, stock: 100, unit: "packs" },
      { name: "Tata Salt (1kg)", price: 28, stock: 80, unit: "packs" },
      { name: "Aashirvaad Shudh Chakki Atta (5kg)", price: 245, stock: 30, unit: "bags" },
      { name: "Fortune Sunlite Refined Oil (1L)", price: 165, stock: 25, unit: "pouches" },
    ]
  },
  {
    key: "fruits_vegetables",
    displayName: "Fruits & Vegetables",
    icon: "nutrition",
    catalogSeed: [
      { name: "Fresh Bananas (1 Dozen)", price: 60, stock: 40, unit: "dozens" },
      { name: "Hybrid Tomatoes (1kg)", price: 35, stock: 50, unit: "kg" },
      { name: "Shimla Royal Apples (1kg)", price: 140, stock: 30, unit: "kg" },
      { name: "Fresh Red Onions (1kg)", price: 40, stock: 60, unit: "kg" },
    ]
  },
  {
    key: "dairy",
    displayName: "Dairy & Milk Booth",
    icon: "water_drop",
    catalogSeed: [
      { name: "Amul Taaza Toned Milk (500ml)", price: 27, stock: 60, unit: "packets" },
      { name: "Mother Dairy Classic Dahi (400g)", price: 35, stock: 40, unit: "cups" },
      { name: "Amul Butter (100g)", price: 58, stock: 45, unit: "packs" },
      { name: "Fresh Malai Paneer (200g)", price: 90, stock: 25, unit: "packs" },
    ]
  },
  {
    key: "fmcg",
    displayName: "Daily Essentials & Packaged Goods",
    icon: "shopping_basket",
    catalogSeed: [
      { name: "Dettol Original Soap (125g)", price: 55, stock: 80, unit: "bars" },
      { name: "Surf Excel Easy Wash (1kg)", price: 140, stock: 35, unit: "packs" },
      { name: "Colgate MaxFresh Spicy Fresh (150g)", price: 110, stock: 50, unit: "tubes" },
      { name: "Vim Dishwash Bar (300g)", price: 30, stock: 100, unit: "bars" },
    ]
  }
];
