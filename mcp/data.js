import { normaliseShop } from './geometry.js';
import { toPublicProduct, formatRupees } from './catalog.js';
import { formatAddress, mapsUrl } from './geo.js';
import { customerStatusLabel } from './orderRules.js';

/**
 * Supabase data access for the MCP tools.
 *
 * Thin on purpose: every function takes the client it should use, so a customer
 * read goes through RLS and a public catalog read goes through the service role.
 * Business rules live in the pure modules, not here.
 */

export class DataError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new DataError(code, message);
};

const strip = (value) => String(value ?? '').trim();

export function publicAddress(row) {
  if (!row) return null;
  return {
    address_id: row.id,
    label: row.label || null,
    address: formatAddress(row),
    line1: row.line1,
    line2: row.line2 || null,
    landmark: row.landmark || null,
    city: row.city || null,
    state: row.state || null,
    pincode: row.pincode || null,
    match_type: row.match_type,
    source: row.source,
    // Provenance, not just precision: the quote reads these to decide whether it
    // may call the address verified. Older rows may predate the columns.
    precision_source: row.precision_source || 'typed',
    geocode_verified: Boolean(row.geocode_verified),
    accuracy_m: row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
    is_default: Boolean(row.is_default),
    maps_url: mapsUrl(row.lat, row.lng),
  };
}

export function addressSnapshot(row, profile) {
  return {
    name: strip(profile?.full_name) || 'Customer',
    phone: strip(profile?.phone),
    address: formatAddress(row),
    lat: Number(row.lat),
    lng: Number(row.lng),
    match_type: row.match_type,
    accuracy_m: row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
    mapsUrl: mapsUrl(row.lat, row.lng),
  };
}

export function publicOrder(row, shop = {}) {
  if (!row) return null;

  // The popup reads src/types.ts Customer. The row stores it as JSONB, so the
  // projection has to keep the same key names in both directions: a rename here
  // silently empties the shopkeeper's phone/map link, not the assistant's reply.
  const stored = row.customer && typeof row.customer === 'object' ? row.customer : {};
  const storedLocation = stored.location && typeof stored.location === 'object' ? stored.location : {};
  const coord = (value) => {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const latitude = coord(stored.latitude) ?? coord(storedLocation.latitude);
  const longitude = coord(stored.longitude) ?? coord(storedLocation.longitude);
  const customer = {
    name: stored.name || row.customer_name || 'Customer',
    whatsappNumber: stored.whatsappNumber || row.customer_phone || '',
    address: stored.address || row.delivery_address || '',
    mapsUrl: stored.mapsUrl || storedLocation.mapsUrl || (latitude !== undefined && longitude !== undefined ? mapsUrl(latitude, longitude) : undefined),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
  };

  return {
    order_id: row.external_id,
    status: row.status,
    status_label: customerStatusLabel(row.status),
    shop: { shop_id: shop.public_shop_id || null, name: shop.store_name || 'Shop' },
    customer,
    items: Array.isArray(row.items) ? row.items : [],
    total: Number(row.total) || 0,
    total_display: formatRupees(Math.round((Number(row.total) || 0) * 100)),
    payment_method: row.payment_method,
    address: row.delivery_address,
    placed_at: row.created_at,
    updated_at: row.updated_at,
    channel: row.channel || 'whatsapp',
  };
}

// ── shops and catalog ────────────────────────────────────────────────────────

export async function loadEnabledShops(db) {
  const { data, error } = await db
    .from('business_profiles')
    .select('user_id,store_name,store_lat,store_lng,store_location_source,public_shop_id,delivery_radius_km,mcp_enabled,orders_paused')
    .eq('mcp_enabled', true);
  if (error) fail('registry_unavailable', error.message);

  const rows = (Array.isArray(data) ? data : []).filter((row) => row.store_location_source !== 'ip_approximate');
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((row) => row.user_id))];
  const counts = {};
  const products = await db.from('products').select('user_id').in('user_id', ids);
  if (!products.error) {
    for (const product of Array.isArray(products.data) ? products.data : []) {
      counts[product.user_id] = (counts[product.user_id] || 0) + 1;
    }
  }

  return rows
    .map((row) => normaliseShop({ ...row, product_count: counts[row.user_id] || 0 }))
    .filter((shop) => Boolean(shop) && shop.catalogItemCount > 0);
}

export async function getShopByPublicId(db, publicShopId) {
  const { data, error } = await db
    .from('business_profiles')
    .select('user_id,store_name,store_lat,store_lng,store_location_source,public_shop_id,delivery_radius_km,mcp_enabled,orders_paused')
    .eq('public_shop_id', publicShopId)
    .eq('mcp_enabled', true)
    .maybeSingle();
  if (error) fail('registry_unavailable', error.message);
  if (!data) return null;
  if (data.store_location_source === 'ip_approximate') return null;
  return normaliseShop(data);
}

export async function getShopByUserId(db, shopUserId) {
  const { data, error } = await db
    .from('business_profiles')
    .select('user_id,store_name,public_shop_id,mcp_enabled,orders_paused')
    .eq('user_id', shopUserId)
    .maybeSingle();
  if (error) fail('registry_unavailable', error.message);
  return data || null;
}

export async function loadShopCatalog(db, shopUserId) {
  const { data, error } = await db
    .from('products')
    .select('external_id,name,price,stock,stock_unit,attributes,image_url')
    .eq('user_id', shopUserId);
  if (error) fail('catalog_unavailable', error.message);
  return (Array.isArray(data) ? data : []).map(toPublicProduct).filter(Boolean);
}

// ── customer profile and addresses ───────────────────────────────────────────

export async function getCustomerProfile(db, userId) {
  // `select('*')` on purpose: the location columns arrive in migration
  // 2026-10-28, and naming them here would make every tool fail with
  // "column does not exist" on a project where that migration has not run yet.
  const { data, error } = await db
    .from('customer_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail('profile_unavailable', error.message);
  return data || null;
}

/**
 * The customer's last known position, captured with consent in the app.
 *
 * `source` records how it was obtained, so a city-level IP guess is never read
 * as a measured fix. Written with the customer's own token: the RLS policies on
 * `customer_profiles` already scope the row to `auth.uid() = user_id`.
 */
export async function saveCustomerLocation(db, userId, { lat, lng, accuracyM = null, source = 'gps', label = null, capturedAt = null }) {
  // `Number(null)` is 0, which would store a real-looking position on the
  // equator. Blanks are rejected before the conversion (same rule as
  // mcp/location.js, applied here because this is the writer).
  const coordinate = (value) => {
    if (value === null || value === undefined || value === '') return NaN;
    return Number(value);
  };
  const latitude = coordinate(lat);
  const longitude = coordinate(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    fail('location_invalid', 'A latitude and a longitude are required.');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    fail('location_invalid', 'The coordinates are outside the valid range.');
  }

  // Only the location keys are sent, so an upsert on an existing profile cannot
  // blank out `full_name` or `phone` (ON CONFLICT updates just these columns).
  const payload = {
    user_id: userId,
    location_lat: latitude,
    location_lng: longitude,
    location_accuracy_m: accuracyM === null || accuracyM === undefined ? null : Number(accuracyM),
    location_source: source,
    location_label: strip(label) || null,
    location_captured_at: capturedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('customer_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) fail('location_save_failed', error.message);
  return data;
}

/** Removes the saved position without touching the profile itself. */
export async function clearCustomerLocation(db, userId) {
  const { error } = await db
    .from('customer_profiles')
    .update({
      location_lat: null,
      location_lng: null,
      location_accuracy_m: null,
      location_source: null,
      location_label: null,
      location_captured_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error) fail('location_clear_failed', error.message);
  return { cleared: true };
}

export async function upsertCustomerProfile(db, userId, { fullName, phone }) {
  const payload = {
    user_id: userId,
    full_name: strip(fullName) || null,
    phone: strip(phone) || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from('customer_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id,full_name,phone,created_at,updated_at')
    .single();
  if (error) fail('profile_unavailable', error.message);
  return data;
}

export async function listAddresses(db, userId) {
  const { data, error } = await db
    .from('customer_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) fail('address_unavailable', error.message);
  return (Array.isArray(data) ? data : []).map(publicAddress).filter(Boolean);
}

export async function getAddressRow(db, userId, addressId) {
  const { data, error } = await db
    .from('customer_addresses')
    .select('*')
    .eq('id', addressId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail('address_unavailable', error.message);
  return data || null;
}

async function clearDefaultAddress(db, userId) {
  await db.from('customer_addresses').update({ is_default: false }).eq('user_id', userId).eq('is_default', true);
}

export async function saveAddressRow(db, userId, fields) {
  const isUpdate = Boolean(fields.address_id);
  const existing = isUpdate ? await getAddressRow(db, userId, fields.address_id) : null;
  if (isUpdate && !existing) fail('address_not_found', 'That address is not on this account.');

  const makeDefault = fields.is_default === true || (!isUpdate && !existing && fields.is_default !== false && (await countAddresses(db, userId)) === 0);
  if (makeDefault) await clearDefaultAddress(db, userId);

  const payload = {
    label: strip(fields.label) || null,
    line1: strip(fields.line1),
    line2: strip(fields.line2) || null,
    landmark: strip(fields.landmark) || null,
    city: strip(fields.city) || null,
    state: strip(fields.state) || null,
    pincode: strip(fields.pincode) || null,
    lat: Number(fields.lat),
    lng: Number(fields.lng),
    accuracy_m: fields.accuracy_m === null || fields.accuracy_m === undefined ? null : Number(fields.accuracy_m),
    match_type: fields.match_type || 'area',
    source: fields.source || 'map_pin',
    // Kept explicit so a row can never be written without its provenance: an
    // unverified coordinate that looks verified is worse than an unknown one.
    precision_source: fields.precision_source || 'typed',
    geocode_verified: Boolean(fields.geocode_verified),
    coords_captured_at: fields.coords_captured_at || null,
    is_default: Boolean(makeDefault || (isUpdate && existing.is_default && fields.is_default !== false)),
    updated_at: new Date().toISOString(),
  };

  const query = isUpdate
    ? db.from('customer_addresses').update(payload).eq('id', fields.address_id).eq('user_id', userId)
    : db.from('customer_addresses').insert({ ...payload, user_id: userId });
  const { data, error } = await query.select('*').single();
  if (error) fail('address_save_failed', error.message);
  return publicAddress(data);
}

async function countAddresses(db, userId) {
  const { count, error } = await db
    .from('customer_addresses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return 0;
  return Number(count) || 0;
}

export async function deleteAddressRow(db, userId, addressId) {
  const existing = await getAddressRow(db, userId, addressId);
  if (!existing) fail('address_not_found', 'That address is not on this account.');
  const { error } = await db.from('customer_addresses').delete().eq('id', addressId).eq('user_id', userId);
  if (error) fail('address_delete_failed', error.message);
  if (existing.is_default) {
    const { data } = await db
      .from('customer_addresses')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (Array.isArray(data) && data[0]) {
      await db.from('customer_addresses').update({ is_default: true }).eq('id', data[0].id).eq('user_id', userId);
    }
  }
  return { deleted: true, address_id: addressId };
}

// ── quotes and orders ────────────────────────────────────────────────────────

export async function createQuote(db, row) {
  const { data, error } = await db
    .from('order_quotes')
    .insert({
      user_id: row.userId,
      shop_user_id: row.shopUserId,
      address_snapshot: row.address,
      items: row.items,
      total: row.total,
      payment_method: row.paymentMethod || 'COD',
      notes: row.notes || null,
      expires_at: row.expiresAt,
      request_hash: row.requestHash || null,
    })
    .select('*')
    .single();
  if (error) {
    // A concurrent identical request (or the transparent socket retry) may have
    // committed first. The unique partial index tells us so; returning the
    // winner's row is the whole point of the index.
    if (String(error.code) === '23505' && row.requestHash) {
      const existing = await findRecentQuote(db, row.userId, row.requestHash, new Date(Date.now() - 60_000).toISOString());
      if (existing) return existing;
    }
    fail('quote_save_failed', error.message);
  }
  return data;
}

/**
 * The quote this request already produced, if any: same hash, same customer,
 * unconsumed, unexpired, created inside the window. One index scan.
 */
export async function findRecentQuote(db, userId, requestHash, sinceIso) {
  if (!requestHash) return null;
  const { data, error } = await db
    .from('order_quotes')
    .select('*')
    .eq('user_id', userId)
    .eq('request_hash', requestHash)
    .is('consumed_at', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('quote_unavailable', error.message);
  return data || null;
}

export async function getQuote(db, userId, quoteId) {
  const { data, error } = await db
    .from('order_quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail('quote_unavailable', error.message);
  return data || null;
}

async function countSince(db, table, filters, since) {
  let query = db.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) fail('limit_unavailable', 'Could not verify the order limits. Try again.');
  return Number(count) || 0;
}

export async function usageCounts(db, userId, shopUserId, since) {
  const quotesLastHour = await countSince(db, 'order_quotes', { user_id: userId }, since);
  const ordersLastHour = await countSince(db, 'orders', { customer_user_id: userId }, since);
  const { count, error } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_user_id', userId)
    .eq('user_id', shopUserId)
    .in('status', ['NEW', 'PREPARING', 'READY_FOR_PICKUP']);
  if (error) fail('limit_unavailable', 'Could not verify the order limits. Try again.');
  return {
    quotesLastHour,
    ordersLastHour,
    activeOrdersForShop: Number(count) || 0,
  };
}

export async function placeOrderRpc(db, { quoteId, userId, externalId }) {
  const { data, error } = await db.rpc('mcp_place_order', {
    p_quote_id: quoteId,
    p_user_id: userId,
    p_external_id: externalId,
  });
  if (error) {
    const message = String(error.message || '');
    const code = ['quote_not_found', 'quote_not_owned', 'quote_already_used', 'quote_expired'].find((name) => message.includes(name));
    fail(code || 'order_failed', message);
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function getOrderRow(db, userId, orderId) {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('external_id', orderId)
    .eq('customer_user_id', userId)
    .maybeSingle();
  if (error) fail('order_unavailable', error.message);
  return data || null;
}

export async function listOrderRows(db, userId, limit = 10) {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 10)));
  if (error) fail('order_unavailable', error.message);
  return Array.isArray(data) ? data : [];
}

export async function cancelOrderRow(db, userId, orderId) {
  const { data, error } = await db
    .from('orders')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('external_id', orderId)
    .eq('customer_user_id', userId)
    .eq('status', 'NEW')
    .select('*')
    .maybeSingle();
  if (error) fail('order_update_failed', error.message);
  if (data) return data;

  const current = await getOrderRow(db, userId, orderId);
  if (!current) fail('order_not_found', 'No order with that id is on this account.');
  if (String(current.status).toUpperCase() === 'CANCELLED') return current;
  fail('cannot_cancel', `This order is already ${customerStatusLabel(current.status).toLowerCase()}. Call the shop instead.`);
}
