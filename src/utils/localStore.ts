/**
 * Local store cache ownership.
 *
 * The cache in localStorage is per-DEVICE, but a store's data is per-ACCOUNT.
 * Without an owner check, signing in as a new account on a browser that already
 * held another account's data showed that account's orders and catalogue — the
 * "new account already has 898 orders" bug.
 *
 * Every app key lives under the `dukan-` / `dukaan-` prefixes, so ownership is
 * enforced by tracking which identity wrote them and dropping the cache before
 * it is read when the identity changes.
 */

export const DATA_OWNER_KEY = 'dukan-data-owner';

const APP_KEY_PREFIXES = ['dukan-', 'dukaan-'];

/** The identity that owns the local cache: the signed-in user id, or 'guest'. */
export const currentIdentity = (): string => {
  if (typeof window === 'undefined') return 'guest';
  try {
    const cached = localStorage.getItem('dukan-auth-user');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {
    // Malformed cache — fall through to guest.
  }
  return 'guest';
};

/** Removes every piece of local app state written under the app prefixes. */
export const clearLocalStore = (): void => {
  if (typeof window === 'undefined') return;
  Object.keys(localStorage)
    .filter((key) => APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => localStorage.removeItem(key));
};

/**
 * Drops the local cache when it belongs to someone other than `identity`, then
 * records `identity` as the owner.
 *
 * Guest data is deliberately promoted: the onboarding a shop completes before
 * signing up belongs to the account they then create. Data with no owner marker
 * predates owner tracking, so its provenance is unknown and it is dropped.
 *
 * @returns true when foreign data was dropped, so the caller can re-hydrate.
 */
export const enforceDataOwnership = (identity: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const owner = localStorage.getItem(DATA_OWNER_KEY);
    const belongsToSomeoneElse =
      owner === null || (owner !== 'guest' && owner !== identity);

    if (belongsToSomeoneElse) {
      clearLocalStore();
      localStorage.setItem(DATA_OWNER_KEY, identity);
      return true;
    }

    localStorage.setItem(DATA_OWNER_KEY, identity);
    return false;
  } catch {
    return false;
  }
};
