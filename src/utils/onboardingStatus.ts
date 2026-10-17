/**
 * Whether a signed-in account still needs onboarding.
 */

export const ONBOARDING_COMPLETE_KEY = 'dukan-onboarding-complete';

/**
 * A store is existing once it has a cloud profile row. The local flag is the
 * second signal: it covers a failed or offline profile read, and it is what
 * onboarding itself writes on completion.
 *
 * Guests are handled separately — they never have a profile row, and their
 * onboarding is tracked by the same local flag.
 */
export const hasCompletedOnboarding = (cloudProfile: unknown): boolean => {
  if (cloudProfile) return true;
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
};
