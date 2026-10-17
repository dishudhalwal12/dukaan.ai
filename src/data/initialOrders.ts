import { Order, OrderStatus } from '../types.ts';

export const initialOrders: Order[] = [
  {
    id: 'B2C-8375',
    customer: {
      name: 'Rohan Sharma',
      whatsappNumber: '+919876543210',
      address: 'A-101, Rose Apartments, Malviya Nagar, New Delhi',
    },
    items: [
      { productId: 'prod1', name: 'product_maggi', quantity: 2, price: '₹96' },
      { productId: 'prod3', name: 'product_parle_g', quantity: 1, price: '₹80' },
    ],
    total: 272.00,
    paymentMethod: 'COD',
    status: OrderStatus.NEW,
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
  },
  {
    id: 'B2C-8374',
    customer: {
      name: 'Priya Patel',
      whatsappNumber: '+919123456789',
      address: 'B-20, Greenfield Colony, Saket, New Delhi',
    },
    items: [
      { productId: 'prod2', name: 'product_amul_milk', quantity: 4, price: '₹68' },
    ],
    total: 272.00,
    paymentMethod: 'UPI',
    status: OrderStatus.NEW,
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
  },
  {
    id: 'B2C-8372',
    customer: {
      name: 'Anjali Verma',
      whatsappNumber: '+919988776655',
      address: 'House No. 5, Sector 15, Gurugram, Haryana',
    },
    items: [
      { productId: 'prod4', name: 'product_tata_salt', quantity: 1, price: '₹28' },
    ],
    total: 28.00,
    paymentMethod: 'COD',
    status: OrderStatus.PREPARING,
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 mins ago
  },
    {
    id: 'B2C-8370',
    customer: {
      name: 'Vikram Singh',
      whatsappNumber: '+919234567890',
      address: 'C-404, Sun City, Vasant Kunj, New Delhi',
    },
    items: [
      { productId: 'prod1', name: 'product_maggi', quantity: 1, price: '₹96' },
      { productId: 'prod2', name: 'product_amul_milk', quantity: 2, price: '₹68' },
    ],
    total: 232.00,
    paymentMethod: 'COD',
    status: OrderStatus.COMPLETED,
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
  },
];