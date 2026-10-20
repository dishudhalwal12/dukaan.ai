/**
 * Accounts created before this instant belong to the existing store base and
 * never auto-start the walkthrough. Accounts created after it are new signups
 * (email or Google) and are eligible once onboarding finishes.
 */
export const WALKTHROUGH_SIGNUP_CUTOFF = '2026-10-20T00:00:00.000Z';

/**
 * Pure comparison so Node tests do not need a DOM or a database.
 * Missing, empty, or unparsable timestamps fail closed.
 */
export const isSignupAfterCutoff = (signupAt, cutoff = WALKTHROUGH_SIGNUP_CUTOFF) => {
  if (!signupAt || !cutoff) return false;
  const signup = new Date(signupAt).getTime();
  const boundary = new Date(cutoff).getTime();
  if (!Number.isFinite(signup) || !Number.isFinite(boundary)) return false;
  return signup >= boundary;
};
