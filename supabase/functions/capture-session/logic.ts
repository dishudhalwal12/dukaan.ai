/**
 * Pure helpers for the `capture-session` Edge Function.
 *
 * Deliberately free of Deno and Supabase APIs so the same code can be imported
 * and tested in a browser context. Everything here is a decision about data the
 * CLIENT sent or the SERVER observed, and both are adversarial:
 *
 *   * the client chooses its own payload, so it must be filtered to a whitelist.
 *     Without that, a caller could set `user_id` on the row and file their
 *     session under another shop, or write `ip_derived_city` themselves and
 *     forge the one block only a server is supposed to know.
 *   * `x-forwarded-for` is a client-supplied header. A caller can prepend
 *     anything to it, so the entries they control are dropped and only the hop
 *     the platform appended is trusted.
 *
 * The IP result is advisory analytics, never access control.
 */

/**
 * The `device_sessions` columns a client may populate. This list is the payload
 * contract: the collector emits exactly these keys, and the write path sends
 * them through untouched. Anything absent here (user_id, the ip_derived block,
 * captured_by, id, created_at) is server-owned and cannot be smuggled in.
 */
export const SESSION_COLUMNS = [
  'session_id',
  'install_id',
  'app_version',
  'is_returning_device',
  'started_at',
  'last_active_at',
  'session_duration_sec',
  'current_page_url',
  'referrer_url',
  'device_category',
  'operating_system',
  'os_version',
  'browser_name',
  'browser_version',
  'user_agent_string',
  'device_memory_gb',
  'hardware_concurrency',
  'device_pixel_ratio',
  'screen_width_css',
  'screen_height_css',
  'screen_width_physical',
  'screen_height_physical',
  'device_orientation',
  'browser_language',
  'current_timezone',
  'timezone_offset_minutes',
  'is_online',
  'network_effective_type',
  'downlink_speed_mbps',
  'round_trip_time_ms',
  'is_data_saver_mode',
  'is_cookies_enabled',
  'battery_level_percentage',
  'is_device_charging',
  'app_performance_load_time_ms',
  'dom_interactive_time_ms',
  'ssl_handshake_duration_ms',
  'session_timeout_count',
  'sync_error_count',
  // deep signals the client can observe (null when the browser cannot report)
  'ua_ch_platform',
  'ua_ch_model',
  'gpu_renderer',
  'storage_quota_bytes',
  'storage_usage_bytes',
  'display_mode',
  'color_scheme',
  'prefers_reduced_motion',
  'prefers_reduced_data',
  'max_touch_points',
  'viewport_width_css',
  'viewport_height_css',
  'color_depth',
  'active_time_sec',
  'page_view_count',
  'cpu_pressure',
  // the store's captured position (reused, never re-prompted) and its locality
  'geo_lat',
  'geo_lng',
  'geo_accuracy_m',
  'geo_altitude_m',
  'geo_speed_mps',
  'geo_heading_deg',
  'geo_source',
  'geo_city',
  'geo_region',
  'geo_country',
  // forward-compat bucket
  'extra',
] as const;

/**
 * Keep only columns the client owns, and only ones it actually sent.
 *
 * A whitelist rather than a blacklist: a column added to the table later is
 * server-owned until someone adds it here on purpose.
 */
export function pickSessionColumns(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};

  const source = payload as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const column of SESSION_COLUMNS) {
    const value = source[column];
    if (value !== undefined) picked[column] = value;
  }
  return picked;
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isIpv6(value: string): boolean {
  const mapped = value.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    return isIpv4(mapped[2]) && /^[0-9a-f:]*$/.test(`${mapped[1]}:`);
  }
  if (!/^[0-9a-f:]+$/.test(value)) return false;
  if (value.indexOf('::') !== value.lastIndexOf('::')) return false;

  const groups = value.split(':').filter(Boolean);
  return value.includes('::') ? groups.length <= 7 : groups.length === 8;
}

export function isValidIp(value: string): boolean {
  const ip = (value || '').trim().toLowerCase();
  if (!ip) return false;
  return ip.includes(':') ? isIpv6(ip) : isIpv4(ip);
}

/** Drop a port or an IPv6 bracket pair, then validate. Null when unusable. */
export function normalizeIp(value: string): string | null {
  let candidate = (value || '').trim();
  if (!candidate) return null;

  if (candidate.startsWith('[')) {
    const closing = candidate.indexOf(']');
    if (closing === -1) return null;
    candidate = candidate.slice(1, closing);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  }

  const lowered = candidate.toLowerCase();
  return isValidIp(lowered) ? lowered : null;
}

/**
 * The caller's address, or null when it cannot be trusted.
 *
 * `x-forwarded-for` is `client, proxy, ...`, and everything to the left of the
 * platform's own hop is attacker-controlled: a caller who sends
 * `X-Forwarded-For: 1.2.3.4` gets that value prepended to the real one. So the
 * LAST valid entry wins, not the first. `cf-connecting-ip` is preferred when
 * present because the edge sets it and replaces any client-supplied copy.
 */
export function extractClientIp(headers: Headers): string | null {
  const edge = normalizeIp(headers.get('cf-connecting-ip') ?? '');
  if (edge) return edge;

  const forwarded = headers.get('x-forwarded-for') ?? '';
  const hops = forwarded
    .split(',')
    .map((hop) => normalizeIp(hop))
    .filter((hop): hop is string => hop !== null);
  if (hops.length > 0) return hops[hops.length - 1];

  return normalizeIp(headers.get('x-real-ip') ?? '');
}

/** SHA-256, lower-case hex. The raw address is never stored or returned. */
export async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export interface IpGeo {
  country: string | null;
  region_state: string | null;
  city: string | null;
  postal_code: string | null;
}

export interface ServerFields {
  client_ip_hash: string | null;
  ip_derived_country: string | null;
  ip_derived_region_state: string | null;
  ip_derived_city: string | null;
  ip_derived_postal_code: string | null;
}

const NO_SERVER_FIELDS: ServerFields = {
  client_ip_hash: null,
  ip_derived_country: null,
  ip_derived_region_state: null,
  ip_derived_city: null,
  ip_derived_postal_code: null,
};

/** Map an ip-api.com payload. Anything that is not a success is "no data". */
export function parseIpApiResponse(payload: unknown): IpGeo | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (data.status !== 'success') return null;

  const text = (value: unknown) =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    country: text(data.country),
    region_state: text(data.regionName),
    city: text(data.city),
    postal_code: text(data.zip),
  };
}

/**
 * Ask ip-api.com where an address is. Free tier, no key, rate limited, and
 * HTTP-only. Every failure means "unknown", never an error the caller sees:
 * geography is a nice-to-have and must not cost us the session row.
 */
export async function lookupIpGeo(ip: string): Promise<IpGeo | null> {
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,zip`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!response.ok) return null;
    return parseIpApiResponse(await response.json());
  } catch {
    return null;
  }
}

/**
 * Everything about the request that only a server can know.
 *
 * Returns the hash and the derived geography; the address itself is not part of
 * the result, so it cannot reach the database by accident.
 */
export async function buildServerFields(
  rawIp: string | null,
  lookup: (ip: string) => Promise<IpGeo | null>,
): Promise<ServerFields> {
  if (!rawIp) return NO_SERVER_FIELDS;

  const geo = await lookup(rawIp).catch(() => null);
  const hash = await hashIp(rawIp).catch(() => null);

  return {
    client_ip_hash: hash,
    ip_derived_country: geo?.country ?? null,
    ip_derived_region_state: geo?.region_state ?? null,
    ip_derived_city: geo?.city ?? null,
    ip_derived_postal_code: geo?.postal_code ?? null,
  };
}

export interface ReverseGeo {
  city: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
}

/**
 * Map a BigDataCloud reverse-geocode response onto the geo columns.
 *
 * That response has no status field, so "success" is defined as "carries a
 * locality": an error object or an empty body is NO DATA, never a row of nulls
 * that would read as a real place. `locality` is the fallback for `city`, which
 * the service omits for small places.
 */
export function parseReverseGeocode(payload: unknown): ReverseGeo | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (data.error) return null;

  const text = (value: unknown) =>
    typeof value === 'string' && value.length > 0 ? value : null;

  const city = text(data.city) ?? text(data.locality);
  const region = text(data.principalSubdivision);
  const country = text(data.countryName);
  const postcode = text(data.postcode);

  if (!city && !region && !country && !postcode) return null;
  return { city, region, country, postcode };
}

/** Latitude in [-90, 90] and longitude in [-180, 180], both real numbers. */
export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}
