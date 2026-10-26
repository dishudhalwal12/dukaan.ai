/**
 * The customer's last known position and whether it may still be used.
 *
 * The Dukaan app captures a fix during MCP sign-in (the same consent sheet the
 * shopkeeper sees at onboarding) and `save_address` / `remember_location` refresh
 * it whenever the customer shares coordinates in the chat. This module decides
 * whether that stored fix is still good enough to find a shop, and how the
 * answer should be described back to the customer.
 *
 * Pure on purpose: no Supabase, no clock of its own, so the 30-day rule can be
 * tested without a network or a fake timer.
 */

/** A position older than this is not used: the customer has probably moved. */
export const LOCATION_MAX_AGE_DAYS = 30;

/** Anything coarser than this is a neighbourhood, not a doorway. */
const AREA_ACCURACY_M = 200;
const CITY_ACCURACY_M = 2000;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** `Number(null)` is 0, which is a real coordinate — so blanks are rejected first. */
const toCoord = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const daysBetween = (fromIso, nowMs) => {
  const captured = Date.parse(String(fromIso || ''));
  if (!Number.isFinite(captured)) return null;
  const days = (nowMs - captured) / 86_400_000;
  return Math.max(0, Math.round(days * 10) / 10);
};

/**
 * How precise the stored fix is, in the same four-level language the geocoder
 * uses. A raw fix is never a "house": there is no address text behind it.
 */
export function precisionForLocation({ source, accuracyM }) {
  if (source === 'ip_approximate') return 'city';
  if (finite(accuracyM)) {
    if (accuracyM <= AREA_ACCURACY_M) return 'street';
    if (accuracyM <= CITY_ACCURACY_M) return 'area';
    return 'city';
  }
  // A GPS fix with no accuracy figure is still far better than a city centroid.
  return source === 'gps' ? 'street' : 'area';
}

/** The sentence fragment used when the fix came from the app rather than the chat. */
export function describeAge(ageDays) {
  if (!finite(ageDays)) return 'unknown age';
  if (ageDays < 1) return 'from today';
  if (ageDays < 1.5) return 'about a day old';
  return `${Math.round(ageDays)} days old`;
}

/**
 * @param {object|null} profile  a `customer_profiles` row (or null)
 * @param {number} nowMs
 * @returns
 *   | { ok: true, lat, lng, accuracyM, source, label, capturedAt, ageDays, precision,
 *       matchType, needsExactAddress: true }
 *   | { ok: false, code: 'location_missing' | 'location_stale', ageDays?: number }
 */
export function storedLocationFromProfile(profile, nowMs = Date.now()) {
  const lat = toCoord(profile?.location_lat);
  const lng = toCoord(profile?.location_lng);

  // A half-written row is not a position. The database CHECK already forbids it,
  // but the tools must not trust that on a project where the migration is newer
  // than the deployed server.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { ok: false, code: 'location_missing' };
  }

  const capturedAt = profile?.location_captured_at || null;
  const ageDays = daysBetween(capturedAt, nowMs);

  // No captured_at means freshness cannot be proven, so it is not used.
  if (ageDays === null || ageDays > LOCATION_MAX_AGE_DAYS) {
    return { ok: false, code: ageDays === null ? 'location_missing' : 'location_stale', ageDays: ageDays ?? undefined };
  }

  const source = String(profile?.location_source || 'gps');
  const accuracyM = profile?.location_accuracy_m === null || profile?.location_accuracy_m === undefined
    ? null
    : Number(profile.location_accuracy_m);
  const precision = precisionForLocation({ source, accuracyM });

  return {
    ok: true,
    lat,
    lng,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
    source,
    label: String(profile?.location_label || '').trim() || 'your saved location',
    capturedAt,
    ageDays,
    precision,
    matchType: precision,
    // Even an exact GPS fix has no door number, so delivery still needs a saved
    // address. `quote_order` enforces that separately.
    needsExactAddress: true,
  };
}
