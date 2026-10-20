/**
 * The store's own coordinates.
 *
 * Captured once, during onboarding or at the first product added, and then
 * reused. `source` records HOW the position was obtained so an approximate value
 * can never be mistaken for a measured one, and `accuracy_m` is kept because a
 * city-level fix and a doorway-level fix are not the same fact.
 *
 * Storing a store's exact position is personal data, so it is captured only
 * after the shopkeeper agrees to it, and only in the browser and their own row.
 */

export type LocationSource = 'gps' | 'manual' | 'ip_approximate';

export interface StoreLocation {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  source: LocationSource;
  captured_at: string;
}

export type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported'
  // A site-level block and a device-level block are different problems with
  // different fixes, and the browser reports both as the same error code.
  | 'blocked_by_device';

/**
 * A string discriminant, not `ok: true | false`. This project compiles without
 * `strictNullChecks`, under which a `false` literal widens to `boolean` and the
 * two members stop being distinguishable — the caller then has to cast to read
 * the failure reason.
 */
export type LocationAttempt =
  | { status: 'captured'; location: StoreLocation }
  | { status: 'failed'; reason: LocationFailure };

export const STORE_LOCATION_KEY = 'dukan-store-location';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStoreLocation(value: unknown): value is StoreLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoreLocation>;
  return isFiniteNumber(candidate.lat) && isFiniteNumber(candidate.lng);
}

export function getStoredStoreLocation(): StoreLocation | null {
  try {
    const raw = localStorage.getItem(STORE_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isStoreLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoreLocation(location: StoreLocation): void {
  try {
    localStorage.setItem(STORE_LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Private mode or storage disabled: the value lives for this session only.
  }
}

/**
 * True once the shop's position is known. This is the catalog gate.
 *
 * A position is "known" only if it was actually measured. A row without
 * coordinates, or with coordinates that are not numbers, does not count — an
 * empty or corrupt entry must not open the gate.
 */
export function hasStoreLocation(): boolean {
  return getStoredStoreLocation() !== null;
}

const FAILURES: Record<number, LocationFailure> = {
  1: 'denied',
  2: 'unavailable',
  3: 'timeout',
};

/**
 * THIS SITE's permission, which is not the same thing as THIS DEVICE's.
 *
 * Chrome reports error code 1 ("denied") both when the shopkeeper blocked this
 * site and when the operating system has location switched off for the browser
 * entirely. Only the Permissions API can tell those apart, and they need
 * different advice — "turn it on for this site" is a lie in the second case and
 * sends the shopkeeper in circles.
 */
export async function geolocationPermissionState(): Promise<string> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    // Safari before 16 rejects this query.
    return 'unknown';
  }
}

/**
 * Code 1 is ambiguous: the site may have been blocked, or the device may be
 * blocking every site. If the site permission is granted and we still got code
 * 1, the refusal came from above the browser.
 */
async function classifyFailure(code: number | undefined): Promise<LocationFailure> {
  const named = FAILURES[code] ?? 'unavailable';
  if (named !== 'denied') return named;
  return (await geolocationPermissionState()) === 'granted' ? 'blocked_by_device' : 'denied';
}

/**
 * Ask the browser for the store's exact position.
 *
 * Never throws and never resolves ambiguously: the caller gets either a
 * location or a named reason, because the modal has to say something different
 * for "you said no" than for "we could not get a fix".
 */
type PositionOutcome =
  | { outcome: 'captured'; location: StoreLocation }
  | { outcome: 'failed'; code?: number };

function requestPosition(): Promise<PositionOutcome> {
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            outcome: 'captured',
            location: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy_m: isFiniteNumber(position.coords.accuracy)
                ? position.coords.accuracy
                : null,
              source: 'gps',
              captured_at: new Date().toISOString(),
            },
          });
        },
        (error) => resolve({ outcome: 'failed', code: error?.code }),
        // A shopkeeper standing in the shop rarely gets an instant fix indoors,
        // but waiting longer than this looks like a frozen screen.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    } catch {
      resolve({ outcome: 'failed' });
    }
  });
}

const RETRY_DELAY_MS = 1200;

export async function captureStoreLocation(): Promise<LocationAttempt> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { status: 'failed', reason: 'unsupported' };
  }

  const first = await requestPosition();
  if (first.outcome === 'captured') return { status: 'captured', location: first.location };

  let reason = await classifyFailure(first.code);

  // Chrome can report code 1 for a moment right after the site permission is
  // granted, before the operating system's grant propagates. One short retry
  // turns that transient refusal into a captured position.
  if (reason === 'blocked_by_device') {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    const retry = await requestPosition();
    if (retry.outcome === 'captured') return { status: 'captured', location: retry.location };
    reason = await classifyFailure(retry.code);
  }

  return { status: 'failed', reason };
}

/**
 * A city-level position from the network, used only when the operating system
 * refuses to give the browser a GPS fix. Explicitly labelled `ip_approximate`
 * so it is never mistaken for a measured position.
 */
export async function captureApproximateLocation(timeoutMs = 6000): Promise<LocationAttempt> {
  if (typeof fetch !== 'function') return { status: 'failed', reason: 'unsupported' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://ipwho.is/?fields=success,latitude,longitude,city', {
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: 'failed', reason: 'unavailable' };
    const data = await res.json();
    if (!data?.success || !isFiniteNumber(data.latitude) || !isFiniteNumber(data.longitude)) {
      return { status: 'failed', reason: 'unavailable' };
    }
    return {
      status: 'captured',
      location: {
        lat: data.latitude,
        lng: data.longitude,
        accuracy_m: 10000,
        source: 'ip_approximate',
        captured_at: new Date().toISOString(),
      },
    };
  } catch {
    return { status: 'failed', reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
