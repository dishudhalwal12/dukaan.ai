import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreLocation } from '../utils/location.ts';

/**
 * The customer's saved position, captured during MCP sign-in.
 *
 * The consent page is the only app surface that writes this, and it writes with
 * the customer's own session: `customer_profiles` already restricts every
 * operation to `auth.uid() = user_id`. The MCP server reads the same row with a
 * user-scoped client, so no service-role write is involved anywhere.
 *
 * The position is a discovery shortcut, never a delivery address: `quote_order`
 * still requires a row in `customer_addresses`.
 */

export const CUSTOMER_LOCATION_KEY = 'dukan-customer-location';

export interface SavedCustomerLocation {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** gps | ip_approximate | manual | chat_shared */
  source: string;
  capturedAt: string | null;
  label: string | null;
}

/**
 * A string discriminant, not `ok: true | false`: this project compiles without
 * `strictNullChecks`, under which a `false` literal widens to `boolean` and the
 * two members stop being distinguishable (same reasoning as utils/location.ts).
 */
export type LocationSaveResult =
  | { status: 'saved'; location: SavedCustomerLocation }
  | { status: 'failed'; reason: 'schema_pending' | 'failed'; message: string };

const numberOrNull = (value: unknown): number | null => {
  // `Number(null)` is 0, which would render as a real position on the equator.
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Maps a `customer_profiles` row onto the shape the page renders. */
export function locationFromProfileRow(row: any): SavedCustomerLocation | null {
  const lat = numberOrNull(row?.location_lat);
  const lng = numberOrNull(row?.location_lng);
  if (lat === null || lng === null) return null;
  return {
    lat,
    lng,
    accuracyM: numberOrNull(row?.location_accuracy_m),
    source: String(row?.location_source || 'gps'),
    capturedAt: row?.location_captured_at || null,
    label: row?.location_label || null,
  };
}

export function getCachedCustomerLocation(): SavedCustomerLocation | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lat = numberOrNull(parsed?.lat);
    const lng = numberOrNull(parsed?.lng);
    if (lat === null || lng === null) return null;
    return {
      lat,
      lng,
      accuracyM: numberOrNull(parsed?.accuracyM),
      source: String(parsed?.source || 'gps'),
      capturedAt: parsed?.capturedAt || null,
      label: parsed?.label || null,
    };
  } catch {
    return null;
  }
}

/** Mirrors the cloud value so the POS surfaces can read it without a round trip. */
export function cacheCustomerLocation(location: SavedCustomerLocation | null): void {
  try {
    if (!location) localStorage.removeItem(CUSTOMER_LOCATION_KEY);
    else localStorage.setItem(CUSTOMER_LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Private mode: the cloud row is still the source of truth.
  }
}

/**
 * A project that has not run migration 2026-10-28 yet has no location columns.
 * That is a deployment-order problem, not a customer error: the page says so
 * quietly and never blocks approval.
 */
function isMissingLocationSchema(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'PGRST204' || /column .*location_.* does not exist/i.test(message) || /Could not find the 'location_/i.test(message);
}

export async function fetchCustomerLocation(
  client: SupabaseClient,
  userId: string
): Promise<SavedCustomerLocation | null> {
  if (!userId) return null;
  const { data, error } = await client
    .from('customer_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return locationFromProfileRow(data);
}

export async function saveCapturedCustomerLocation(
  client: SupabaseClient,
  userId: string,
  captured: StoreLocation
): Promise<LocationSaveResult> {
  if (!userId) return { status: 'failed', reason: 'failed', message: 'Sign in again before sharing a location.' };

  const saved: SavedCustomerLocation = {
    lat: captured.lat,
    lng: captured.lng,
    accuracyM: captured.accuracy_m ?? null,
    source: captured.source,
    capturedAt: captured.captured_at || new Date().toISOString(),
    label: null,
  };

  // Only the location keys are sent, so an existing profile keeps its name and
  // delivery phone (ON CONFLICT updates just these columns).
  const { data, error } = await client
    .from('customer_profiles')
    .upsert(
      {
        user_id: userId,
        location_lat: saved.lat,
        location_lng: saved.lng,
        location_accuracy_m: saved.accuracyM,
        location_source: saved.source,
        location_captured_at: saved.capturedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) {
    if (isMissingLocationSchema(error)) {
      return {
        status: 'failed',
        reason: 'schema_pending',
        message: 'Cloud saving is not switched on yet, so this location stays on this device only.',
      };
    }
    return { status: 'failed', reason: 'failed', message: error.message || 'The location could not be saved.' };
  }

  return { status: 'saved', location: locationFromProfileRow(data) || saved };
}

export async function removeCustomerLocation(
  client: SupabaseClient,
  userId: string
): Promise<{ status: 'removed' | 'failed'; message?: string }> {
  const { error } = await client
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

  if (error) return { status: 'failed', message: error.message };
  return { status: 'removed' };
}

const SOURCE_LABEL: Record<string, string> = {
  gps: 'GPS',
  ip_approximate: 'Approximate',
  manual: 'Entered by you',
  chat_shared: 'From your chat',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[String(source)] || 'Saved';
}

/** "2 days old", "today", "about a day old" — the same wording the MCP tools use. */
export function describeLocationAge(capturedAt: string | null, now = Date.now()): string {
  const captured = Date.parse(String(capturedAt || ''));
  if (!Number.isFinite(captured)) return 'age unknown';
  const days = Math.max(0, (now - captured) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 1.5) return 'about a day ago';
  return `${Math.round(days)} days ago`;
}

/** The one-line summary shown in the consent card. */
export function describeSavedLocation(location: SavedCustomerLocation, now = Date.now()): string {
  const parts = [sourceLabel(location.source)];
  if (location.accuracyM !== null && Number.isFinite(location.accuracyM)) {
    const metres = Math.round(location.accuracyM);
    parts.push(metres >= 1000 ? `±${Math.round(metres / 1000)} km` : `±${metres} m`);
  }
  parts.push(describeLocationAge(location.capturedAt, now));
  return parts.join(' · ');
}
