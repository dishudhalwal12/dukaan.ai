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
export function captureStoreLocation(): Promise<LocationAttempt> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ status: 'failed', reason: 'unsupported' });
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            status: 'captured',
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
        async (error) => {
          resolve({ status: 'failed', reason: await classifyFailure(error?.code) });
        },
        // A shopkeeper standing in the shop rarely gets an instant fix indoors,
        // but waiting longer than this looks like a frozen screen.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    } catch {
      resolve({ status: 'failed', reason: 'unavailable' });
    }
  });
}
