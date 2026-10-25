/**
 * Abuse limits for the MCP ordering channel.
 *
 * These are counts, not a token bucket: the data layer already queries the
 * recent quote/order rows, and a plain count is easy to explain to a merchant.
 */

export const LIMITS = {
  quotesPerHour: 20,
  ordersPerHour: 5,
  activeOrdersPerShop: 3,
  maxOrderPaise: 1_000_000, // ₹10,000
};

export function evaluateOrderLimits({ quotesLastHour = 0, ordersLastHour = 0, activeOrdersForShop = 0 } = {}) {
  if (Number(quotesLastHour) >= LIMITS.quotesPerHour) {
    return {
      ok: false,
      code: 'rate_limited',
      message: 'Too many order previews in the last hour. Try again later.',
    };
  }
  if (Number(ordersLastHour) >= LIMITS.ordersPerHour) {
    return {
      ok: false,
      code: 'rate_limited',
      message: 'Too many orders in the last hour. Try again later.',
    };
  }
  if (Number(activeOrdersForShop) >= LIMITS.activeOrdersPerShop) {
    return {
      ok: false,
      code: 'active_order_limit',
      message: 'You already have active orders with this shop. Wait for one to finish or cancel it.',
    };
  }
  return { ok: true };
}

export function checkOrderTotal(totalPaise) {
  if (!Number.isFinite(totalPaise) || totalPaise <= 0 || totalPaise > LIMITS.maxOrderPaise) {
    return {
      ok: false,
      code: 'order_too_large',
      message: 'This order total is not valid. Reduce the basket and try again.',
    };
  }
  return { ok: true };
}


export const READ_LIMIT = { max: 60, windowMs: 60_000 };
const readWindows = new Map();

/**
 * Per-process sliding-window guard for discovery/geocoding tools.
 *
 * Serverless instances do not share this map, so it is a cost guard, not a
 * billing boundary. Order writes have their own database-backed limits.
 */
export function allowRead(userId, now = Date.now()) {
  const key = String(userId || '');
  if (!key) return false;
  const cutoff = now - READ_LIMIT.windowMs;
  const recent = (readWindows.get(key) || []).filter((at) => at > cutoff);
  if (recent.length >= READ_LIMIT.max) {
    readWindows.set(key, recent);
    return false;
  }
  recent.push(now);
  readWindows.set(key, recent);
  while (readWindows.size > 5000) readWindows.delete(readWindows.keys().next().value);
  return true;
}

/** Test seam. */
export function resetReadLimit() {
  readWindows.clear();
}
