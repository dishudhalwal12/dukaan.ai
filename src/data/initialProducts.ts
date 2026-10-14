import { Product } from '../types.ts';

export const initialProducts: Product[] = [
  {
    id: 'prod1',
    name: 'product_maggi',
    price: '₹96',
    stock: 50,
    stockUnit: 'packs',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcR_1iA8T9T2B4zO_VtrJoSA0vQbbfxWd_2n-A&s'
  },
  {
    id: 'prod2',
    name: 'product_amul_milk',
    price: '₹68',
    stock: 30,
    stockUnit: 'cartons',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcT6y-n52J2bMMz0sA4D2HQzDXs2oKqv4i-pSQ&s'
  },
  {
    id: 'prod3',
    name: 'product_parle_g',
    price: '₹80',
    stock: 100,
    stockUnit: 'packs',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcT3Y8naCsO5Xg3A9D-M6h_3_4c-w-QjX_p4zQ&s'
  },
  {
    id: 'prod4',
    name: 'product_tata_salt',
    price: '₹28',
    stock: 80,
    stockUnit: 'packs',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANdGcRz-a6f9f-0J4p-W8yBf_2h2Kj9Z-J5Gq8r-g&s'
  },
];
