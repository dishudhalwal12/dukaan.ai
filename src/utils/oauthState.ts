/**
 * The small decisions behind the Google redirect hand-off.
 *
 * Signing in with Google leaves the page entirely and comes back with either a
 * `code` in the URL (success path, still being exchanged), an `error` (refused),
 * or nothing at all (the consent window was closed). The app has to tell those
 * apart before it reacts to the page regaining focus, because reacting to a
 * closed consent window as if it were a sign-out is what dropped cached data and
 * reloaded the page in a loop.
 *
 * Pure functions, no `window`, so they can be tested under plain node.
 */

/** The URL says a callback is being processed right now. */
export const urlCarriesOAuthCallback = (href: string): boolean => {
  try {
    const url = new URL(href);
    if (url.searchParams.has('code') || url.searchParams.has('access_token')) return true;
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (!hash) return false;
    const hashParams = new URLSearchParams(hash);
    return hashParams.has('access_token') || hashParams.has('refresh_token');
  } catch {
    return false;
  }
};

export interface FocusSignals {
  /** `dukan-oauth-in-progress` is set: a Google sign-in was started and is unaccounted for. */
  pending: boolean;
  /** The URL currently carries an OAuth callback. */
  callbackInUrl: boolean;
  /** A session exists right now. */
  hasSession: boolean;
}

/**
 * Whether the page regaining focus must be ignored.
 *
 * While a callback is in the URL the exchange owns the session; a "no session
 * yet" answer read during it is a race, not a sign-out. While a Google sign-in is
 * merely pending, the absence of a session still is not a sign-out — the consent
 * window may be open on another screen.
 */
export const shouldIgnoreFocusSession = ({ pending, callbackInUrl }: FocusSignals): boolean =>
  pending || callbackInUrl;

/**
 * Whether a Google sign-in that never came back should now be written off.
 *
 * True only when it was started, there is no callback in the URL, and no session
 * appeared: the consent window was closed. The caller then clears the marker and
 * puts the sign-in button back to normal instead of replaying the flow.
 */
export const shouldAbandonPendingOAuth = ({ pending, callbackInUrl, hasSession }: FocusSignals): boolean =>
  pending && !callbackInUrl && !hasSession;
