import path from 'path';
import { fileURLToPath } from 'url';
import { dukanCatalog } from './dukanCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Shop registry + nearest-shop matcher.
 *
 * WHY THIS FILE EXISTS
 * A customer may be served by any nearby Nukkad shop. When a customer shares a
 * WhatsApp location pin, we must pick WHICH shop should fulfil the order and
 * hand that shop's catalog to the ordering bot.
 *
 * RANKING: nearest shop to the customer first; ties broken by the shop carrying
 * the most catalog items, then by a stable id so the choice never depends on
 * input order.
 *
 * RANGE: a shop farther than DUKAN_MAX_DELIVERY_KM (default 5 km) does not
 * serve the customer, and neither does an empty registry — in that case the bot
 * places NO order. A single local fallback shop exists only for offline/dev use
 * (an explicit `fallbackOwner`); it is never chosen while the registry is live.
 *
 * FAIL CLOSED: a shop row is only usable when it has a real owner (`userId`) and
 * valid coordinates. An ownerless shop is skipped rather than default-filled,
 * because an order with no owner is visible to nobody and an order filled with
 * a default owner is misrouted to one shop on a shared backend.
 */

export const DEFAULT_MAX_DELIVERY_KM = 5;

/** Delivery radius in km. A missing, non-numeric or non-positive value → 5. */
export function maxDeliveryKm(env = process.env) {
  const raw = Number(env.DUKAN_MAX_DELIVERY_KM);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_DELIVERY_KM;
}

/** Great-circle distance in km between two { latitude, longitude } points. */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A finite number inside [lo, hi], or null. `0` and `"0"` are valid; ""/null are not. */
function coord(v, lo, hi) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return n;
}

/**
 * Turns a shop row into the canonical shape, or null when it cannot serve an
 * order. Accepts both the canonical shape and a raw Supabase `business_profiles`
 * row, so the network provider stays a thin `fetch`.
 *
 * Shape: { shopId, userId, shopName, latitude, longitude, catalogItemCount }
 */
export function normaliseShop(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const userId = raw.userId ?? raw.user_id ?? null;
  if (typeof userId !== 'string' || userId.trim() === '') return null;

  const latitude = coord(raw.latitude ?? raw.store_lat ?? raw.lat, -90, 90);
  const longitude = coord(raw.longitude ?? raw.store_lng ?? raw.lng, -180, 180);
  if (latitude === null || longitude === null) return null;

  return {
    shopId: String(raw.shopId ?? raw.user_id ?? userId),
    userId,
    shopName: String(raw.shopName ?? raw.store_name ?? 'Store'),
    latitude,
    longitude,
    catalogItemCount: Number(raw.catalogItemCount ?? raw.product_count ?? raw.catalog_count) || 0,
  };
}

/**
 * Orders shops for a customer location: nearest first, then biggest catalog,
 * then a stable id tie-break. Shops that cannot serve an order are dropped.
 * Returns [{ ...shop, distanceKm }].
 */
export function rankShops(shops, location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return [];
  }
  return (Array.isArray(shops) ? shops : [])
    .map((s) => (s && typeof s.userId === 'string' && Number.isFinite(s.latitude) ? s : normaliseShop(s)))
    .filter(Boolean)
    .map((s) => ({
      ...s,
      distanceKm: distanceKm(location, { latitude: s.latitude, longitude: s.longitude }),
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        b.catalogItemCount - a.catalogItemCount ||
        String(a.shopId).localeCompare(String(b.shopId))
    );
}

/**
 * Picks the shop that should serve this customer location.
 *
 * @returns {{matched:true, shop, distanceKm:number|null, isFallback:boolean}}
 *        | {{matched:false, reason:'no-location'|'no-shops'|'out-of-range', nearestKm?:number}}
 */
export function matchNearestShop(location, shops = [], options = {}) {
  const maxKm = Number.isFinite(options.maxKm) ? options.maxKm : maxDeliveryKm();
  const fallbackOwner = options.fallbackOwner || null;

  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return { matched: false, reason: 'no-location' };
  }

  const ranked = rankShops(shops, location);

  if (ranked.length === 0) {
    // Offline/dev only. A live registry never reaches here with shops present,
    // and an empty live registry must reject rather than invent an owner.
    if (fallbackOwner) {
      return {
        matched: true,
        isFallback: true,
        distanceKm: null,
        shop: {
          shopId: 'local',
          userId: fallbackOwner,
          shopName: 'Nukkad Store',
          latitude: location.latitude,
          longitude: location.longitude,
          catalogItemCount: dukanCatalog.getAll().length,
          isFallback: true,
        },
      };
    }
    return { matched: false, reason: 'no-shops' };
  }

  const best = ranked[0];
  if (!(best.distanceKm <= maxKm + 1e-9)) {
    return { matched: false, reason: 'out-of-range', nearestKm: best.distanceKm };
  }
  return { matched: true, isFallback: false, distanceKm: best.distanceKm, shop: { ...best, isFallback: false } };
}

/**
 * Default provider: the live Supabase registry. Kept behind an injectable seam
 * so every test runs without a network. Returns raw rows; `loadShops` normalises
 * them. Errors propagate on purpose — `loadShops` must be able to tell an
 * unreachable registry (null) from an empty one ([]).
 */
async function defaultProvider() {
  const cloud = await import('./dukanCloud.js');
  return await cloud.fetchShopRows();
}

/**
 * Loads the shop registry.
 * @returns {Promise<Array|null>} normalised shops, or null when the registry
 *   could not be reached (distinct from an empty registry, which is []).
 */
export async function loadShops(provider = defaultProvider) {
  try {
    const rows = await provider();
    if (!Array.isArray(rows)) return [];
    return rows.map(normaliseShop).filter(Boolean);
  } catch (e) {
    console.warn('[Shops] Could not load the shop registry:', e.message);
    return null;
  }
}
