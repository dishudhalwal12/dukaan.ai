import type React from 'react';

export enum Screen {
  DASHBOARD = 'DASHBOARD',
  SALES = 'SALES',
  ORDERS = 'ORDERS',
  INSIGHTS = 'INSIGHTS',
  CATALOG = 'CATALOG',
  SETTINGS = 'SETTINGS',
  ONLINE_STORE = 'ONLINE_STORE', // Kept for potential future use
}

export enum InsightType {
  Suggestion = 'SUGGESTION',
  Forecast = 'FORECAST',
  Alert = 'ALERT',
  Trend = 'TREND',
}

export interface Product {
  id: string;
  name: string;
  price: string;
  stock: number;
  stockUnit: string;
  imageUrl: string;
}

export interface Insight {
  icon: string;
  title: string;
  description: string;
}

// Types for B2C Orders
export interface OrderItem {
  productId: string;
  name:string;
  quantity: number;
  price: string;
}

export enum OrderStatus {
  NEW = 'NEW',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export interface Customer {
  name: string;
  whatsappNumber: string;
  address: string;
}

export interface Order {
  id: string;
  customer: Customer;
  items: OrderItem[];
  total: number;
  paymentMethod: 'COD' | 'UPI';
  status: OrderStatus;
  timestamp: string; // ISO String
}

export interface UnityDeal {
  id: string;
  productId: string;
  productNameKey: string;
  imageUrl: string;
  wholesalePrice: number;
  retailPrice: number;
  targetQuantity: number;
  currentQuantity: number;
  stockUnit: string;
  participants: number;
  category: string; // e.g., 'Snacks', 'Daily Essentials'
  tag?: string;
  tagColor?: string; // Tailwind CSS classes e.g. 'bg-red-500/20 text-red-300'
}