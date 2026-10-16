import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dukanCatalog } from './dukanCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'store');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');

/**
 * Shop registry + nearest-shop matcher.
 *
 * WHY THIS FILE EXISTS
 * A customer may be served by any nearby Dukaan shop. When a customer shares a
 * WhatsApp location pin, we must pick WHICH shop should fulfil the order and
 * hand that shop's catalog to the ordering bot.
 *
 * RANKING: nearest shop to the customer first; ties broken by the shop carrying
 * the most catalog items (more items = more likely to be able to fulfil).
 *
 * STATUS: LOCAL STUB — no database yet. Shops are read from `store/shops.json`
 * when that file exists; otherwise the bot falls back to the single local shop
 * that owns `store/catalog.json`. The message flow around this is final, so
 * wiring the database below switches the whole thing on without other changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(next dev): connect this to Supabase (branch `dukaan.ai-by-vishi`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema on that branch (from the vishi app's supabase_schema.sql):
 *   business_profiles(id TEXT PK, user_id UUID, store_name TEXT, profile_data JSONB, ...)
 *   products(id TEXT PK, user_id UUID, name TEXT, price TEXT, stock INT, stock_unit, image_url, ...)
 *   orders(id TEXT PK, user_id UUID, customer JSONB, items JSONB, total, payment_method, status, ...)
 *
 * Steps to switch on:
 *   1. `cd whatsapp && npm i @supabase/supabase-js`
 *   2. add SUPABASE_URL and SUPABASE_SERVICE_KEY to whatsapp/.env
 *   3. shop coordinates live in business_profiles.profile_data as:
 *        { "latitude": 26.9124, "longitude": 75.7873 }
 *   4. rewrite `loadShops()` to fetch:
 *        business_profiles(id, store_name, profile_data)  -- where lat/lng are set
 *      and attach each shop's catalog size with a `products` count grouped by user_id.
 *      Keep the returned shape: { shopId, userId, shopName, latitude, longitude, catalogItemCount }
 *   5. orders created by the bot must carry the matched shop's user_id
 *      (dukanOrders.createOrder needs a `userId`/`shopId` field — see dukanOrders.js).
 *   6. load the matched shop's catalog instead of the global one:
 *        dukanCatalog.syncFromStore(rows from products where user_id = shop.userId)
 *      `activeShops` in dukanBot.js already remembers the match per customer.
 *   7. SECURITY: `products`/`orders` RLS on that branch lets `anon` read+write
 *      everything. Use the service key server-side only, and tighten the
 *      policies before any real shop data lands there.
 */

/**
 * Shops known to this backend. Shape:
 * { shopId, userId, shopName, latitude, longitude, catalogItemCount }
 * Coordinates are optional; shops without them are ignored for distance ranking.
 */
export function loadShops() {
  try {
    if (fs.existsSync(SHOPS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[Shops] Could not read store/shops.json:', e.message);
  }
  return [];
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

/**
 * Orders shops for a customer location: nearest first, then biggest catalog.
 * Returns [{ ...shop, distanceKm }]. Shops without coordinates are dropped.
 */
export function rankShops(shops, location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return [];
  }
  return shops
    .filter((s) => s && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
    .map((s) => ({
      ...s,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      distanceKm: distanceKm(location, { latitude: Number(s.latitude), longitude: Number(s.longitude) }),
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        (Number(b.catalogItemCount) || 0) - (Number(a.catalogItemCount) || 0)
    );
}

/**
 * Picks the shop that should serve this customer location.
 * Falls back to the local single shop until the registry is populated.
 */
export function matchNearestShop(location, shops = loadShops()) {
  if (!location) return null;
  const ranked = rankShops(shops, location);
  if (ranked.length > 0) return { ...ranked[0], isFallback: false };

  return {
    shopId: 'local',
    // Owner of the local single shop, until the shop registry is wired. Orders
    // with no owner are visible to no one, so this must be set for the bot's
    // orders to reach the shopkeeper's app.
    userId: process.env.DUKAN_DEFAULT_OWNER_ID || null,
    shopName: 'Dukaan Store',
    distanceKm: null,
    catalogItemCount: dukanCatalog.getAll().length,
    isFallback: true,
  };
}
