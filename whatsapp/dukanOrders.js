import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'store');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let orders = [];

try {
  if (fs.existsSync(ORDERS_FILE)) {
    orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  }
} catch (e) {
  orders = [];
}

function saveOrders() {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to save orders:', err.message);
  }
}

let orderCounter = 1000 + orders.length;

export const dukanOrders = {
  getAll() {
    return [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getById(id) {
    return orders.find(o => o.id === id);
  },

  getPending() {
    return orders.filter(o => o.status === 'PENDING');
  },

  createOrder({ customerJid, customerPhone, customerName, deliveryAddress, items, totalAmount, notes }) {
    orderCounter++;
    const orderId = `DKN-${orderCounter}`;

    const newOrder = {
      id: orderId,
      customerJid,
      customerPhone: customerPhone || customerJid.replace(/@.*$/, ''),
      customerName: customerName || 'Customer',
      deliveryAddress: deliveryAddress || 'Address not provided',
      items: items || [],
      totalAmount: Number(totalAmount) || 0,
      status: 'PENDING', // PENDING | ACCEPTED | PREPARING | OUT_FOR_DELIVERY | DELIVERED | REJECTED
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes || '',
    };

    orders.unshift(newOrder);
    saveOrders();
    return newOrder;
  },

  updateStatus(id, newStatus, extra = {}) {
    const order = orders.find(o => o.id === id);
    if (!order) return null;

    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
    if (extra.notes) order.notes = extra.notes;
    if (extra.rejectReason) order.rejectReason = extra.rejectReason;

    saveOrders();
    return order;
  },

  clear() {
    orders = [];
    saveOrders();
  }
};
