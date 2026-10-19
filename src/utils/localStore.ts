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

/**
 * Keys that belong to the DEVICE rather than to a store: the user's own
 * preferences and the cached auth identity.
 *
 * Deliberately a deny-list. Store keys added later are dropped by default, so a
 * forgotten entry here can only annoy a user, never leak one account's data
 * into another account's session.
 */
const DEVICE_KEYS = new Set([
  'dukan-language',
  'dukan-language-chosen',
  'dukan-openrouter-api-key',
  'dukan-auth-user',
  'dukan-oauth-in-progress',
  'dukan-install-id',
  DATA_OWNER_KEY,
  'dukan-ownership-reboot-at',
]);

/**
 * When the last ownership-triggered reload happened.
 *
 * Kept in localStorage rather than sessionStorage because it has to hold across
 * tabs: the reload brings up a new document, and a per-tab store can lose the
 * marker while another tab is still starting. Losing it re-armed the reload and
 * turned one cache drop into a reload loop.
 */
export const OWNERSHIP_REBOOT_KEY = 'dukan-ownership-reboot-at';

/** At most one ownership reload in this window; a second would loop. */
export const OWNERSHIP_REBOOT_COOLDOWN_MS = 30_000;

/** Whether a reload is still warranted, given when the last one happened. */
export const shouldReloadForOwnership = (
  lastRebootAt: number,
  now: number,
  cooldownMs: number = OWNERSHIP_REBOOT_COOLDOWN_MS,
): boolean => {
  if (!Number.isFinite(lastRebootAt) || lastRebootAt <= 0) return true;
  if (!Number.isFinite(now)) return false;
  return now - lastRebootAt >= cooldownMs;
};

/**
 * Records this reload and says whether it may happen.
 *
 * False when one already happened inside the cooldown: the caller then keeps
 * going with the empty cache it just built instead of reloading again.
 */
export const claimOwnershipReboot = (now: number = Date.now()): boolean => {
  try {
    const last = Number(localStorage.getItem(OWNERSHIP_REBOOT_KEY) || 0);
    if (!shouldReloadForOwnership(last, now)) return false;
    localStorage.setItem(OWNERSHIP_REBOOT_KEY, String(now));
    return true;
  } catch {
    return false;
  }
};

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
 * Removes local state that belongs to a store, keeping device-scoped keys.
 *
 * Used by the ownership check, which fires on an ordinary page load when the
 * identity changed — there it would be wrong to also discard the user's
 * language choice, saved API key or the cached identity the shell reads to
 * decide whether to prompt for sign-in.
 */
const clearStoreData = (): void => {
  if (typeof window === 'undefined') return;
  Object.keys(localStorage)
    .filter((key) => APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .filter((key) => !DEVICE_KEYS.has(key))
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
      clearStoreData();
      localStorage.setItem(DATA_OWNER_KEY, identity);
      return true;
    }

    localStorage.setItem(DATA_OWNER_KEY, identity);
    return false;
  } catch {
    return false;
  }
};
