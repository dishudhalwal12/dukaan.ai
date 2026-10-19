import { dukanCatalog, getAliasesForName } from './dukanCatalog.js';

/**
 * Supabase access for the WhatsApp backend, over the REST API with the service
 * key (server-side only — never shipped to the browser).
 *
 * Two directions:
 *   READ  — the shop registry (business_profiles + a product-count tally) and a
 *           shop's own catalog (products), so the bot can route and price.
 *   WRITE — mirror a confirmed order into `orders` so the shopkeeper's app sees
 *           it, upserted on (user_id, external_id) so a re-send never duplicates.
 *
 * FAIL CLOSED: reads throw so the caller can refuse to order; the order mirror
 * returns { ok:false } and never throws, because a mirror failure must not lose
 * an order the shopkeeper already accepted.
 */

const REST_TIMEOUT_MS = 8000;

/** Supabase connection details, read from the environment on every call. */
export function cloudConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '');
  return { url, key, configured: Boolean(url && key) };
}

/** 'configured' when the backend can reach Supabase, else 'unconfigured' (dev). */
export function registryStatus(env = process.env) {
  return cloudConfig(env).configured ? 'configured' : 'unconfigured';
}

async function restRequest(pathAndQuery, { method = 'GET', body, prefer, fetchImpl = globalThis.fetch, timeoutMs = REST_TIMEOUT_MS } = {}) {
  const { url, key } = cloudConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (method === 'GET') return await res.json();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The shop registry: every owner who has a store location, with the size of
 * their catalog as a tie-break. Returns [] when Supabase is not configured (dev
 * fallback); throws when the request fails, so a partial outage never looks like
 * an empty registry.
 */
export async function fetchShopRows(opts = {}) {
  if (!cloudConfig().configured) return [];

  const rows = await restRequest(
    'business_profiles?select=user_id,store_name,store_lat,store_lng&store_lat=not.is.null&store_lng=not.is.null',
    opts
  );

  // Catalog size is a tie-break only: a failure here must not hide the shops.
  const counts = {};
  try {
    const products = await restRequest('products?select=user_id', opts);
    for (const p of Array.isArray(products) ? products : []) {
      counts[p.user_id] = (counts[p.user_id] || 0) + 1;
    }
  } catch (e) {
    console.warn('[Cloud] Could not tally catalog sizes:', e.message);
  }

  return (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, product_count: counts[r.user_id] || 0 }));
}

/** Maps a Supabase `products` row to the bot's product shape. */
export function toBotProduct(row) {
  if (!row || typeof row !== 'object') return null;
  const name = String(row.name || '').trim();
  if (!name) return null;
  return {
    id: String(row.external_id || row.id || name),
    name,
    category: row.attributes?.category || row.category || 'General',
    price: typeof row.price === 'number' ? row.price : (parseFloat(String(row.price || '').replace(/[^\d.]/g, '')) || 0),
    unit: row.stock_unit || row.unit || 'unit',
    inStock: row.stock == null ? row.inStock !== false : Number(row.stock) > 0,
    keywords: getAliasesForName(name),
  };
}

/**
 * One shop's catalog, keyed by its owner id.
 * Without Supabase configured, the single local shop uses the global catalog.
 */
export async function loadShopCatalog(userId, opts = {}) {
  if (!userId) return [];
  if (!cloudConfig().configured) return dukanCatalog.getAll();

  const rows = await restRequest(
    `products?select=external_id,name,price,stock,stock_unit,attributes&user_id=eq.${encodeURIComponent(userId)}`,
    opts
  );
  return (Array.isArray(rows) ? rows : []).map(toBotProduct).filter(Boolean);
}

/** The engine's order status → the shopkeeper app's status vocabulary. */
const STATUS_MAP = {
  PENDING: 'NEW',
  ACCEPTED: 'PREPARING',
  OUT_FOR_DELIVERY: 'READY_FOR_PICKUP',
  DELIVERED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

export function mapOrderStatus(status) {
  return STATUS_MAP[String(status || 'PENDING').toUpperCase()] || 'NEW';
}

/** The schema only allows COD or UPI. */
export function mapPaymentMethod(order) {
  return /upi/i.test(String(order?.notes || '')) ? 'UPI' : 'COD';
}

/**
 * Builds the `orders` row for the shopkeeper app. The `customer` JSONB carries
 * both a nested location and flat coordinates, which is what the app's order
 * normaliser and details modal read.
 */
export function buildOrderRow(order) {
  const loc = (order && order.location) || {};
  const latitude = Number.isFinite(loc.latitude) ? loc.latitude : Number.isFinite(loc.lat) ? loc.lat : null;
  const longitude = Number.isFinite(loc.longitude) ? loc.longitude : Number.isFinite(loc.lng) ? loc.lng : null;

  return {
    user_id: order?.userId ?? null,
    external_id: order?.id ?? null,
    status: mapOrderStatus(order?.status),
    total: Number(order?.totalAmount) || 0,
    payment_method: mapPaymentMethod(order),
    customer: {
      name: order?.customerName || 'Customer',
      whatsappNumber: order?.customerPhone || '',
      address: order?.deliveryAddress || '',
      location: { latitude, longitude, mapsUrl: loc.mapsUrl || null },
      latitude,
      longitude,
    },
    items: Array.isArray(order?.items) ? order.items : [],
    // Flat copies of the customer fields, for dashboards that read a column rather
    // than digging into the JSONB (the client writer fills the same four).
    customer_phone: order?.customerPhone || null,
    customer_name: order?.customerName || 'Customer',
    delivery_address: order?.deliveryAddress || null,
    notes: order?.notes ?? null,
  };
}

/**
 * Mirrors one order into Supabase, upserting on (user_id, external_id).
 * @returns {Promise<{ok:boolean, error?:string, skipped?:boolean}>}
 *   Never throws.
 */
export async function mirrorOrder(order, { fetchImpl = globalThis.fetch, timeoutMs = REST_TIMEOUT_MS } = {}) {
  try {
    const { configured } = cloudConfig();
    if (!configured) return { ok: false, skipped: true, error: 'Supabase is not configured' };
    if (!order?.userId) return { ok: false, error: 'order has no owner' };
    if (!order?.id) return { ok: false, error: 'order has no id' };

    const row = buildOrderRow(order);
    try {
      await restRequest('orders?on_conflict=user_id,external_id', {
        method: 'POST',
        body: row,
        prefer: 'resolution=merge-duplicates,return=minimal',
        fetchImpl,
        timeoutMs,
      });
      return { ok: true };
    } catch (e) {
      // An older deployed table may carry only the JSONB and the base columns; the
      // optional flat columns then fail the whole upsert. Retry without them so the
      // order is saved rather than dropped.
      const { customer_phone, customer_name, delivery_address, notes, ...baseRow } = row;
      try {
        await restRequest('orders?on_conflict=user_id,external_id', {
          method: 'POST',
          body: baseRow,
          prefer: 'resolution=merge-duplicates,return=minimal',
          fetchImpl,
          timeoutMs,
        });
        return { ok: true };
      } catch (inner) {
        return { ok: false, error: inner.message };
      }
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
