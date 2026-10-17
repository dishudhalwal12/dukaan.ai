/**
 * Auth flow helpers shared by the sign-in modal and the app shell.
 */

export type AuthOutcome = 'signed-in' | 'confirm-email' | 'error';

/**
 * Supabase returns a user but no session when the project requires email
 * confirmation. Treating that as a successful sign-in would drop the user into
 * an unauthenticated app, so it gets its own outcome.
 */
export const classifyAuthOutcome = ({ user, session }: { user?: unknown; session?: unknown }): AuthOutcome => {
  if (!user) return 'error';
  return session ? 'signed-in' : 'confirm-email';
};

export const FRESH_SIGNIN_KEY = 'dukan-fresh-signin';

/** Records that the current auth came from an interactive sign-in. */
export const markFreshSignIn = (): void => {
  try {
    sessionStorage.setItem(FRESH_SIGNIN_KEY, 'true');
  } catch {
    // Storage unavailable — the popup simply won't be shown.
  }
};

/**
 * Reads and clears the marker. One-shot: the welcome-back popup must fire on an
 * interactive sign-in, never on a silent session restore or a later reload.
 */
export const consumeFreshSignIn = (): boolean => {
  try {
    const fresh = sessionStorage.getItem(FRESH_SIGNIN_KEY) === 'true';
    sessionStorage.removeItem(FRESH_SIGNIN_KEY);
    return fresh;
  } catch {
    return false;
  }
};

/** Drops the marker without reading it, for a sign-in that never completed. */
export const clearFreshSignIn = (): void => {
  try {
    sessionStorage.removeItem(FRESH_SIGNIN_KEY);
  } catch {
    // Storage unavailable.
  }
};
