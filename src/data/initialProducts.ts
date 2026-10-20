import { Product } from '../types.ts';

export const initialProducts: Product[] = [
  {
    id: 'prod1',
    name: 'product_maggi',
    price: '₹96',
    stock: 50,
    stockUnit: 'packs',
    imageUrl: 'https://m.media-amazon.com/images/I/81x6KodxNZL.jpg'
  },
  {
    id: 'prod2',
    name: 'product_amul_milk',
    price: '₹68',
    stock: 30,
    stockUnit: 'cartons',
    imageUrl: 'https://m.media-amazon.com/images/I/61STCwHWEuL._AC_UF894,1000_QL80_.jpg'
  },
  {
    id: 'prod3',
    name: 'product_parle_g',
    price: '₹10',
    stock: 100,
    stockUnit: 'packs',
    imageUrl: 'https://m.media-amazon.com/images/I/714PuAiIeeL._AC_UF894,1000_QL80_.jpg'
  },
  {
    id: 'prod4',
    name: 'product_tata_salt',
    price: '₹28',
    stock: 80,
    stockUnit: 'packs',
    imageUrl: 'https://m.media-amazon.com/images/I/614mm2hYHyL.jpg'
  },
];
