/**
 * Address geocoding for the MCP channel.
 *
 * Default provider is OpenStreetMap Nominatim, the same provider the WhatsApp
 * bot already uses. A Google key switches the provider without changing tools.
 * Every result carries a match type and an accuracy figure so a city centroid
 * can never masquerade as a house.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const defaultCache = new Map();
let lastNominatimAt = 0;

async function throttleNominatim(minIntervalMs) {
  const wait = Math.max(0, lastNominatimAt + minIntervalMs - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimAt = Date.now();
}

const clean = (value) => String(value ?? '').trim();

/** Builds the geocoder query, including the country to disambiguate India. */
export function buildAddressQuery(fields = {}) {
  const parts = [
    clean(fields.line1),
    clean(fields.line2),
    clean(fields.landmark),
    clean(fields.city),
    clean(fields.state),
    clean(fields.pincode),
    'India',
  ].filter(Boolean);
  return parts.join(', ');
}

/** The human-readable address shown back to the customer (no country suffix). */
export function formatAddress(fields = {}) {
  return [
    clean(fields.line1),
    clean(fields.line2),
    clean(fields.landmark),
    clean(fields.city),
    clean(fields.state),
    clean(fields.pincode),
  ]
    .filter(Boolean)
    .join(', ');
}

export function mapsUrl(lat, lng) {
  return `https://maps.google.com/?q=${Number(lat)},${Number(lng)}`;
}

/** Maps Nominatim's place classification to our four-level accuracy model. */
export function matchTypeFromNominatim(result = {}) {
  const kind = String(result.addresstype || result.type || '').toLowerCase();
  if (['house', 'building', 'apartments', 'residential', 'house_number'].includes(kind)) {
    return { matchType: 'house', accuracyM: 25 };
  }
  if (['road', 'street', 'footway', 'pedestrian', 'path', 'lane'].includes(kind)) {
    return { matchType: 'street', accuracyM: 100 };
  }
  if (['suburb', 'neighbourhood', 'quarter', 'city_district', 'postcode', 'postal_code'].includes(kind)) {
    return { matchType: 'area', accuracyM: 500 };
  }
  if (['city', 'town', 'village', 'municipality', 'administrative'].includes(kind)) {
    return { matchType: 'city', accuracyM: 5000 };
  }
  return { matchType: 'area', accuracyM: 750 };
}

/** Maps Google's location_type to the same four-level model. */
export function matchTypeFromGoogle(locationType) {
  switch (String(locationType || '').toUpperCase()) {
    case 'ROOFTOP':
      return { matchType: 'house', accuracyM: 20 };
    case 'RANGE_INTERPOLATED':
      return { matchType: 'street', accuracyM: 80 };
    case 'GEOMETRIC_CENTER':
      return { matchType: 'area', accuracyM: 400 };
    case 'APPROXIMATE':
    default:
      return { matchType: 'city', accuracyM: 3000 };
  }
}

/** A city-level result is not precise enough to deliver an order to. */
export function needsExactAddress(matchType) {
  return String(matchType) === 'city';
}

function readCache(cache, key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(cache, key, value, now) {
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

async function fetchJson(fetchImpl, url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response || !response.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeNominatim(query, fetchImpl, minIntervalMs) {
  await throttleNominatim(minIntervalMs);
  const url = `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&countrycodes=in&limit=1&q=${encodeURIComponent(query)}`;
  const body = await fetchJson(fetchImpl, url, {
    'User-Agent': 'Nukkad-MCP/1.0 (https://dukaan.ai; support@dukaan.ai)',
    'Accept-Language': 'en',
    Accept: 'application/json',
  });
  const result = Array.isArray(body) ? body[0] : null;
  if (!result) return null;
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const mapped = matchTypeFromNominatim(result);
  return {
    lat,
    lng,
    displayName: String(result.display_name || query),
    ...mapped,
    provider: 'nominatim',
  };
}

async function geocodeGoogle(query, fetchImpl, key) {
  const url = `${GOOGLE_URL}?address=${encodeURIComponent(query)}&region=in&key=${encodeURIComponent(key)}`;
  const body = await fetchJson(fetchImpl, url, { Accept: 'application/json' });
  if (body?.status === 'ZERO_RESULTS') return null;
  if (body?.status !== 'OK') throw new Error(`Google geocoder: ${body?.status || 'unknown'}`);
  const result = Array.isArray(body.results) ? body.results[0] : null;
  if (!result) return null;
  const lat = Number(result.geometry?.location?.lat);
  const lng = Number(result.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const mapped = matchTypeFromGoogle(result.geometry?.location_type);
  return {
    lat,
    lng,
    displayName: String(result.formatted_address || query),
    ...mapped,
    provider: 'google',
  };
}

/**
 * Geocodes a structured address.
 *
 * @returns {{ok:true, lat:number, lng:number, displayName:string,
 *            matchType:'house'|'street'|'area'|'city', accuracyM:number,
 *            provider:string, needsExactAddress:boolean, mapsUrl:string}
 *          | {ok:false, code:'address_required'|'address_not_found'|'geocoder_unavailable', message:string}}
 */
export async function geocodeAddress(fields, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    googleKey = '',
    cache = defaultCache,
    now = () => Date.now(),
    minIntervalMs = 1100,
  } = options;

  const query = buildAddressQuery(fields);
  if (!clean(fields.line1) && !clean(fields.pincode)) {
    return { ok: false, code: 'address_required', message: 'Add a house/street line or a pincode.' };
  }

  const provider = options.provider || (googleKey ? 'google' : 'nominatim');
  const key = `${provider}:${query.toLowerCase()}`;
  const cached = readCache(cache, key, now());
  if (cached) return cached;

  let result;
  try {
    result = provider === 'google'
      ? await geocodeGoogle(query, fetchImpl, googleKey)
      : await geocodeNominatim(query, fetchImpl, minIntervalMs);
  } catch {
    // A misconfigured Google key must not block the whole channel. Fall back to
    // the keyless provider once; a genuine address miss still returns null.
    if (provider === 'google') {
      try {
        result = await geocodeNominatim(query, fetchImpl, minIntervalMs);
      } catch {
        return {
          ok: false,
          code: 'geocoder_unavailable',
          message: 'The address service is unavailable. Try again, or share a map pin.',
        };
      }
    } else {
      return {
        ok: false,
        code: 'geocoder_unavailable',
        message: 'The address service is unavailable. Try again, or share a map pin.',
      };
    }
  }

  if (!result) {
    return {
      ok: false,
      code: 'address_not_found',
      message: 'That address could not be located. Add a landmark or a pincode and try again.',
    };
  }

  // A six-digit pincode is a delivery area, never a rooftop.
  const pincodeOnly = !clean(fields.line1) && /^\d{6}$/.test(clean(fields.pincode));
  if (pincodeOnly && result.matchType !== 'area') {
    result.matchType = 'area';
    result.accuracyM = Math.max(result.accuracyM, 500);
  }

  const value = {
    ok: true,
    ...result,
    needsExactAddress: needsExactAddress(result.matchType),
    mapsUrl: mapsUrl(result.lat, result.lng),
  };
  writeCache(cache, key, value, now());
  return value;
}
