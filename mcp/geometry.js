/**
 * Pure geo and shop-ranking helpers for the MCP server.
 *
 * Kept free of Supabase, HTTP, and filesystem imports so the ranking rules can
 * be tested under plain node and reused by the local dev server.
 */

export const DEFAULT_MAX_DELIVERY_KM = 5;
export const MAX_DELIVERY_RADIUS_KM = 10;

const EARTH_RADIUS_KM = 6371;

/** A finite number inside [lo, hi], or null. `0` is a valid coordinate. */
function coord(value, lo, hi) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}

/** Great-circle distance in km, or NaN when either point is invalid. */
export function distanceKm(a, b) {
  const lat1 = coord(a?.latitude ?? a?.lat, -90, 90);
  const lng1 = coord(a?.longitude ?? a?.lng, -180, 180);
  const lat2 = coord(b?.latitude ?? b?.lat, -90, 90);
  const lng2 = coord(b?.longitude ?? b?.lng, -180, 180);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return NaN;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Radius in km: a missing/invalid value falls back to 5; the hard cap is 10. */
export function deliveryRadiusKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_DELIVERY_KM;
  return Math.min(n, MAX_DELIVERY_RADIUS_KM);
}

/**
 * Turns a Supabase `business_profiles` row into the canonical shop shape.
 * Returns null when the row cannot safely serve an order.
 *
 * Shape: { shopId, userId, name, latitude, longitude, catalogItemCount,
 *          deliveryRadiusKm, mcpEnabled, ordersPaused }
 */
export function normaliseShop(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const userId = raw.userId ?? raw.user_id ?? null;
  if (typeof userId !== 'string' || userId.trim() === '') return null;

  const latitude = coord(raw.latitude ?? raw.store_lat ?? raw.lat, -90, 90);
  const longitude = coord(raw.longitude ?? raw.store_lng ?? raw.lng, -180, 180);
  if (latitude === null || longitude === null) return null;

  const shopId = String(raw.shopId ?? raw.public_shop_id ?? raw.user_id ?? userId);
  return {
    shopId,
    userId,
    name: String(raw.name ?? raw.shopName ?? raw.store_name ?? 'Store').trim() || 'Store',
    latitude,
    longitude,
    catalogItemCount: Math.max(0, Number(raw.catalogItemCount ?? raw.product_count ?? raw.catalog_count) || 0),
    deliveryRadiusKm: deliveryRadiusKm(raw.deliveryRadiusKm ?? raw.delivery_radius_km),
    mcpEnabled: raw.mcpEnabled ?? raw.mcp_enabled ?? true,
    ordersPaused: raw.ordersPaused ?? raw.orders_paused ?? false,
  };
}

/** True when the shop is switched on for AI ordering and is not paused. */
export function isShopAvailable(shop) {
  return Boolean(shop && shop.mcpEnabled !== false && shop.ordersPaused !== true);
}

/**
 * Sorts shops for a customer: nearest first, then the bigger catalog, then a
 * stable id. Unavailable shops and shops without usable coordinates are dropped.
 * Returns `{ ...shop, distanceKm }` entries.
 */
export function rankShops(shops, location) {
  if (!location || Number.isNaN(distanceKm(location, location))) return [];

  return (Array.isArray(shops) ? shops : [])
    .map(normaliseShop)
    .filter(Boolean)
    .filter(isShopAvailable)
    .map((s) => ({ ...s, distanceKm: distanceKm(location, s) }))
    .filter((s) => Number.isFinite(s.distanceKm))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        b.catalogItemCount - a.catalogItemCount ||
        String(a.shopId).localeCompare(String(b.shopId))
    );
}

/**
 * Whether one shop can deliver to this point.
 * @returns {{ok:true, distanceKm:number, radiusKm:number} |
 *           {ok:false, reason:'no_shop'|'no_location'|'out_of_range', distanceKm?:number, radiusKm?:number}}
 */
export function serviceability(shop, location) {
  if (!shop) return { ok: false, reason: 'no_shop' };
  if (!location || Number.isNaN(distanceKm(location, location))) return { ok: false, reason: 'no_location' };

  const normalised = normaliseShop(shop);
  if (!normalised) return { ok: false, reason: 'no_shop' };

  const km = distanceKm(location, normalised);
  const radiusKm = normalised.deliveryRadiusKm;
  if (!Number.isFinite(km)) return { ok: false, reason: 'no_location' };
  if (km > radiusKm + 1e-9) return { ok: false, reason: 'out_of_range', distanceKm: km, radiusKm };
  return { ok: true, distanceKm: km, radiusKm };
}

/** Rounds a distance for display; never invents precision. */
export function roundedKm(km) {
  if (!Number.isFinite(km)) return null;
  return Math.round(km * 10) / 10;
}
