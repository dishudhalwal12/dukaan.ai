/**
 * Pure order rules for the MCP server.
 *
 * The model can describe a basket, but it never supplies a price or a total.
 * Every line is priced from the shop's catalog here.
 */

import { formatRupees } from './catalog.js';

export const MAX_LINES = 30;
export const MAX_QUANTITY = 20;
export const QUOTE_TTL_MS = 10 * 60 * 1000;

const fail = (code, message, details = undefined) => ({ ok: false, code, message, details });

/** Merges duplicate product lines, preserving first-seen order. */
function mergeLines(items) {
  const merged = new Map();
  for (const item of items) {
    const id = String(item?.product_id ?? item?.productId ?? '').trim();
    if (!id) return { error: 'quantity_invalid' };
    const quantity = item?.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { error: 'quantity_invalid', productId: id };
    }
    const existing = merged.get(id);
    if (existing) {
      const next = existing + quantity;
      if (next > MAX_QUANTITY) return { error: 'quantity_invalid', productId: id };
      merged.set(id, next);
    } else {
      merged.set(id, quantity);
    }
  }
  return { lines: [...merged.entries()] };
}

/**
 * Builds a priced quote from requested lines and a shop catalog.
 *
 * @returns {{ok:true, items:Array, totalPaise:number, total:string, expiresAt:string}
 *          | {ok:false, code:string, message:string, details?:object}}
 */
export function buildQuote({ items, catalog, now = Date.now() }) {
  if (!Array.isArray(items) || items.length === 0) {
    return fail('items_required', 'Add at least one item before asking for a quote.');
  }

  const merged = mergeLines(items);
  if (merged.error) {
    return fail(
      merged.error,
      `Each item needs a whole-number quantity between 1 and ${MAX_QUANTITY}.`,
      merged.productId ? { productIds: [merged.productId] } : undefined
    );
  }
  if (merged.lines.length > MAX_LINES) {
    return fail('too_many_lines', `An order can have at most ${MAX_LINES} different items.`);
  }

  const byId = new Map((Array.isArray(catalog) ? catalog : []).map((product) => [product.productId, product]));
  const unknown = [];
  const unavailable = [];
  const insufficient = [];
  const priced = [];

  for (const [productId, quantity] of merged.lines) {
    const product = byId.get(productId);
    if (!product) {
      unknown.push(productId);
      continue;
    }
    if (!product.inStock) {
      unavailable.push(productId);
      continue;
    }
    if (Number.isFinite(product.stock) && quantity > product.stock) {
      insufficient.push(productId);
      continue;
    }
    const totalPaise = product.pricePaise * quantity;
    priced.push({
      productId: product.productId,
      name: product.name,
      pricePaise: product.pricePaise,
      price: product.price,
      unit: product.unit,
      quantity,
      totalPaise,
      total: formatRupees(totalPaise),
    });
  }

  if (unknown.length > 0) {
    return fail('product_not_found', 'Some items are not in this shop\'s catalog.', { productIds: unknown });
  }
  if (unavailable.length > 0) {
    return fail('product_unavailable', 'Some items are out of stock.', { productIds: unavailable });
  }
  if (insufficient.length > 0) {
    return fail('insufficient_stock', 'Some items do not have enough stock for that quantity.', { productIds: insufficient });
  }

  const totalPaise = priced.reduce((sum, line) => sum + line.totalPaise, 0);
  return {
    ok: true,
    items: priced,
    totalPaise,
    total: formatRupees(totalPaise),
    expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
  };
}

/** True when the quote has no usable expiry, or the expiry is at/before now. */
export function isQuoteExpired(quote, now = Date.now()) {
  const value = quote?.expires_at ?? quote?.expiresAt;
  if (!value) return true;
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return true;
  return at <= now;
}

/** Customers may cancel only an order the shop has not accepted yet. */
export function canCustomerCancel(status) {
  return String(status ?? '').toUpperCase() === 'NEW' || String(status ?? '').toUpperCase() === 'PENDING';
}

/** A short, non-technical status line for the customer. */
export function customerStatusLabel(status) {
  switch (String(status ?? '').toUpperCase()) {
    case 'NEW':
    case 'PENDING':
      return 'Waiting for the shop to accept';
    case 'PREPARING':
    case 'ACCEPTED':
      return 'The shop is preparing your order';
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery';
    case 'COMPLETED':
    case 'DELIVERED':
      return 'Delivered';
    case 'REJECTED':
      return 'Rejected by the shop';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}
