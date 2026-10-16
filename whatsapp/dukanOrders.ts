import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Order, OrderStatus, OrderItem, Customer } from '../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to parse root .env file if not already populated in process.env
function loadEnv(): void {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (e: any) {
      console.warn('Could not read .env file:', e.message);
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

if (supabase) {
  console.log('[WhatsApp Engine] Supabase client initialized:', supabaseUrl);
} else {
  console.warn('[WhatsApp Engine] Supabase credentials not found. Falling back to local orders.json only.');
}

const ORDERS_FILE_PATH = path.join(__dirname, 'orders.json');

// In-memory cache for latest order
let latestOrder: Order | null = null;

/**
 * Read orders from the local orders.json file.
 */
export function getAllOrders(): Order[] {
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = fs.readFileSync(ORDERS_FILE_PATH, 'utf-8');
      return JSON.parse(data || '[]');
    }
  } catch (err: any) {
    console.error('[WhatsApp Engine] Failed to read orders.json:', err.message);
  }
  return [];
}

/**
 * Persist an order to local orders.json.
 */
function saveOrderToLocal(order: Order): void {
  try {
    const orders = getAllOrders();
    const existingIndex = orders.findIndex(o => o.id === order.id);
    if (existingIndex >= 0) {
      orders[existingIndex] = order;
    } else {
      orders.unshift(order);
    }
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[WhatsApp Engine] Failed to save order to orders.json:', err.message);
  }
}

/**
 * Get the latest confirmed order for the webhook polling endpoint.
 */
export function getLatestOrder(): Order | null {
  if (latestOrder) return latestOrder;
  const orders = getAllOrders();
  return orders.length > 0 ? orders[0] : null;
}

export interface IncomingOrderPayload {
  id?: string;
  user_id?: string;
  phone?: string;
  customer_phone?: string;
  name?: string;
  customer_name?: string;
  address?: string;
  delivery_address?: string;
  customer?: Partial<Customer>;
  items?: Array<{
    productId?: string;
    id?: string;
    name?: string;
    quantity?: number;
    price?: number | string;
  }>;
  total?: number | string;
  payment_method?: string;
  paymentMethod?: string;
  status?: OrderStatus | string;
  notes?: string;
  timestamp?: string;
  created_at?: string;
}

/**
 * Creates and confirms a new order from WhatsApp or API.
 * Pushes the order directly into the Supabase 'orders' table
 * and updates local orders.json and latest-order queue.
 */
export async function createOrder(
  orderInput: IncomingOrderPayload = {}, 
  explicitUserId: string | null = null
): Promise<Order> {
  const timestamp = orderInput.timestamp || orderInput.created_at || new Date().toISOString();
  const orderId = orderInput.id || `WA-${Date.now().toString().slice(-6)}`;

  // Extract customer details
  const customerPhone = String(
    orderInput.customer_phone || 
    orderInput.phone || 
    orderInput.customer?.whatsappNumber || 
    ''
  );

  const customerName = String(
    orderInput.customer_name || 
    orderInput.name || 
    orderInput.customer?.name || 
    'WhatsApp Customer'
  );

  const deliveryAddress = String(
    orderInput.delivery_address || 
    orderInput.address || 
    orderInput.customer?.address || 
    'Store Pickup / WhatsApp'
  );

  // Normalize items array
  const rawItems = Array.isArray(orderInput.items) ? orderInput.items : [];
  const items: OrderItem[] = rawItems.map(item => {
    const priceNum = typeof item.price === 'number' 
      ? item.price 
      : parseFloat(String(item.price ?? '0').replace('₹', '') || '0');

    return {
      productId: String(item.productId || item.id || `prod-${Date.now()}`),
      name: String(item.name || 'Item'),
      quantity: Number(item.quantity || 1),
      price: `₹${priceNum}`,
    };
  });

  // Calculate total
  const rawTotal = typeof orderInput.total === 'number' 
    ? orderInput.total 
    : parseFloat(String(orderInput.total ?? '0').replace('₹', '') || '0');

  const computedTotal = rawTotal > 0
    ? rawTotal
    : items.reduce((sum, item) => sum + item.quantity * parseFloat(item.price.replace('₹', '') || '0'), 0);

  // Acceptable statuses: NEW, PENDING, ACCEPTED, PREPARING, etc.
  const statusStr = String(orderInput.status || 'PENDING').toUpperCase();
  const status = (Object.values(OrderStatus).includes(statusStr as OrderStatus) 
    ? statusStr 
    : OrderStatus.PENDING) as OrderStatus;

  const paymentMethod = String(orderInput.payment_method || orderInput.paymentMethod || 'COD').toUpperCase();
  const notes = orderInput.notes || 'Order placed via WhatsApp';
  const userId = orderInput.user_id || explicitUserId || null;

  const orderRecord: Order = {
    id: orderId,
    customer: {
      name: customerName,
      whatsappNumber: customerPhone,
      address: deliveryAddress,
    },
    customer_phone: customerPhone || undefined,
    customer_name: customerName,
    delivery_address: deliveryAddress,
    items,
    total: computedTotal,
    paymentMethod,
    status,
    notes,
    timestamp,
  };

  // 1. Direct Supabase Cloud Sync
  if (supabase) {
    try {
      const dbRow = {
        id: orderId,
        user_id: userId,
        customer_phone: customerPhone || null,
        customer_name: customerName,
        delivery_address: deliveryAddress,
        customer: orderRecord.customer,
        items,
        total: computedTotal,
        payment_method: paymentMethod,
        status: status,
        notes: notes,
        created_at: timestamp,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('orders')
        .upsert(dbRow, { onConflict: 'id' });

      if (error) {
        console.error('[WhatsApp Engine] Supabase order sync failed:', error.message);
      } else {
        console.log(`[WhatsApp Engine] Order ${orderId} synced to Supabase successfully.`);
      }
    } catch (err: any) {
      console.error('[WhatsApp Engine] Exception while syncing to Supabase:', err.message);
    }
  }

  // 2. Local JSON Persistence
  saveOrderToLocal(orderRecord);

  // 3. Update in-memory latest order for instantaneous polling
  latestOrder = orderRecord;

  return orderRecord;
}

/**
 * Updates status of an existing order in both Supabase and local orders.json.
 */
export async function updateOrderStatus(orderId: string, newStatus: string): Promise<Order | null> {
  const statusStr = String(newStatus).toUpperCase();
  const status = (Object.values(OrderStatus).includes(statusStr as OrderStatus) 
    ? statusStr 
    : OrderStatus.PENDING) as OrderStatus;

  if (supabase) {
    try {
      await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      console.log(`[WhatsApp Engine] Updated order ${orderId} status to ${status} in Supabase`);
    } catch (err: any) {
      console.error('[WhatsApp Engine] Failed to update status in Supabase:', err.message);
    }
  }

  const orders = getAllOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = status;
    saveOrderToLocal(order);
    if (latestOrder && latestOrder.id === orderId) {
      latestOrder = order;
    }
    return order;
  }

  return null;
}
