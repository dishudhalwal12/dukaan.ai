import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'store');
// Tests point this at a throwaway file so a run never rewrites the live store.
const ORDERS_FILE = process.env.DUKAN_ORDERS_FILE
  ? path.resolve(process.env.DUKAN_ORDERS_FILE)
  : path.join(DATA_DIR, 'orders.json');

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

function getNextOrderId() {
  let maxNum = 1000;
  for (const o of orders) {
    if (o.id && o.id.startsWith('DKN-')) {
      const num = parseInt(o.id.replace('DKN-', ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `DKN-${maxNum + 1}`;
}

export const dukanOrders = {
  getAll() {
    // Raw, unscoped view. The merchant app never calls this — it is the
    // operator console's explicit opt-in (see the server's ?scope=all).
    return [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /**
   * Orders belonging to one account. Rows with no owner (or a different owner)
   * are never returned, so a fresh account cannot inherit another shop's orders.
   * A missing/blank owner short-circuits to [] rather than falling back to "all".
   */
  getByOwner(userId) {
    if (typeof userId !== 'string' || userId.trim() === '') return [];
    return [...orders]
      .filter(o => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getById(id) {
    return orders.find(o => o.id === id);
  },

  getPending() {
    return orders.filter(o => o.status === 'PENDING');
  },

  createOrder({ customerJid, customerPhone, customerName, deliveryAddress, items, totalAmount, notes, location, userId }) {
    const orderId = getNextOrderId();

    const newOrder = {
      id: orderId,
      // The account this order belongs to. Null when the fulfilling shop could
      // not be resolved — such an order is deliberately visible to no one
      // rather than to everyone.
      userId: userId || null,
      customerJid,
      customerPhone: customerPhone || (customerJid ? customerJid.replace(/@.*$/, '') : ''),
      customerName: customerName || 'Customer',
      deliveryAddress: deliveryAddress || 'Address not provided',
      location: location || null,
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

  getLatestByCustomer(customerPhoneOrJid) {
    const clean = (customerPhoneOrJid || '').replace(/@.*$/, '').replace(/:\d+/, '');
    return orders.find(o => 
      (o.customerJid && o.customerJid.includes(clean)) ||
      (o.customerPhone && o.customerPhone.includes(clean))
    );
  },

  cancelOrderByCustomer(customerPhoneOrJid) {
    const clean = (customerPhoneOrJid || '').replace(/@.*$/, '').replace(/:\d+/, '');
    const active = orders.find(o => 
      ((o.customerJid && o.customerJid.includes(clean)) ||
       (o.customerPhone && o.customerPhone.includes(clean))) &&
      !['CANCELLED', 'DELIVERED', 'REJECTED'].includes(o.status)
    );
    if (!active) return null;
    active.status = 'CANCELLED';
    active.updatedAt = new Date().toISOString();
    active.rejectReason = 'Cancelled by customer';
    saveOrders();
    return active;
  },

  clear() {
    orders = [];
    saveOrders();
  }
};

/**
 * What a request is allowed to read.
 *
 * `scope=all` is the operator console's explicit cross-shop view; every other
 * request is scoped to the account it names. An unnamed request is served
 * nothing rather than everything.
 */
export function selectOrders({ scope, userId } = {}) {
  return scope === 'all' ? dukanOrders.getAll() : dukanOrders.getByOwner(userId);
}

/**
 * The selector a request is entitled to, derived ONLY from the verified token.
 *
 * `?userId=` used to be trusted outright, so any caller could name any shop and
 * read its orders. The owner now comes from `req.auth` (set by apiAuth.js once
 * Supabase has verified the access token), and `?scope=all` — the operator's
 * cross-shop view — is honoured only for a requester who really is an operator.
 * An anonymous request names nobody and is therefore served nothing.
 */
export function ordersQueryFor(req = {}) {
  const auth = req.auth || {};
  const wantsAll = Boolean(req.query && req.query.scope === 'all');
  return {
    scope: wantsAll && auth.isOperator ? 'all' : undefined,
    userId: auth.userId,
  };
}
