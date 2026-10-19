/**
 * Turning an auth failure into words a shopkeeper can act on.
 *
 * Supabase answers `signInWithPassword` with the same 400
 * `invalid_credentials` / "Invalid login credentials" for a wrong password, for
 * an email with no account, and for a Google-only account that has no password.
 * That is deliberate (it stops the endpoint being used to discover which
 * addresses are registered), so the app cannot say "this account does not
 * exist" without asking a separate service — a question this app has decided not
 * to ask. What it CAN do is stop showing the raw string, and offer the one
 * action that helps a first-time visitor: switch to sign up with the address
 * they just typed.
 *
 * Pure string/number work so it can be tested under plain node.
 */

/** What the screen offers beside the message. */
export type AuthFailureAction = 'sign-up' | 'none';

export interface AuthFailureCopy {
  text: string;
  action: AuthFailureAction;
}

export interface AuthFailureInput {
  /** The provider's message, if any. Never shown verbatim. */
  message?: string | null;
  /** `AuthError.code`, e.g. `invalid_credentials`. */
  code?: string | null;
  /** `AuthError.status` (HTTP status). */
  status?: number | null;
  /** True when the form is in sign-up mode. */
  isSignUp?: boolean;
}

const INVALID_CREDENTIALS_TEXT = "We couldn't find a match for that email and password.";
const SIGN_UP_TEXT = "We couldn't create the account. Please try again.";
const ACCOUNT_EXISTS_TEXT = 'An account with this email already exists. Sign in instead.';
const GENERIC_TEXT = "We couldn't sign you in. Please try again.";
const RATE_LIMIT_TEXT = 'Too many attempts. Please wait a minute and try again.';
const OFFLINE_TEXT = "We couldn't reach the server. Check your internet and try again.";

const normalize = (message?: string | null): string =>
  typeof message === 'string' ? message.trim().toLowerCase() : '';

/** Supabase's "wrong password / no such account / no password set" answer. */
export const isInvalidCredentialsCode = (code?: string | null): boolean =>
  typeof code === 'string' && code.trim().toLowerCase() === 'invalid_credentials';

/**
 * A provider rate limit. Kept separate from a normal failure because the advice
 * is different: waiting fixes this, retyping does not.
 */
const isRateLimited = ({ message, code, status }: AuthFailureInput): boolean => {
  if (status === 429) return true;
  if (typeof code === 'string' && /rate[_-]?limit/.test(code.toLowerCase())) return true;
  return /too many requests|rate limit/.test(normalize(message));
};

/** The browser never reached Supabase at all. */
const isNetworkFailure = (message?: string | null): boolean =>
  /failed to fetch|network ?error|load failed|networkerror|timed? ?out|offline/.test(normalize(message));

const isInvalidCredentials = ({ message, code }: AuthFailureInput): boolean =>
  isInvalidCredentialsCode(code) || /invalid login credentials|invalid credentials/.test(normalize(message));

/**
 * The message to show, plus whether the form should offer the one-tap switch to
 * sign up. The provider's own text is never returned: it is English-only jargon
 * and it leaks the fact that the API is Supabase.
 */
export const describeAuthFailure = (input: AuthFailureInput): AuthFailureCopy => {
  const isSignUp = input.isSignUp === true;

  if (isRateLimited(input)) {
    return { text: RATE_LIMIT_TEXT, action: 'none' };
  }

  if (!isSignUp && isNetworkFailure(input.message)) {
    return { text: OFFLINE_TEXT, action: 'none' };
  }

  if (isSignUp) {
    // The address is already taken: that is a useful fact, not a failure, and
    // the advice is to sign in instead.
    if (input.code === 'account_exists') {
      return { text: ACCOUNT_EXISTS_TEXT, action: 'none' };
    }
    return { text: SIGN_UP_TEXT, action: 'none' };
  }

  if (isInvalidCredentials(input)) {
    return { text: INVALID_CREDENTIALS_TEXT, action: 'sign-up' };
  }

  // Some other provider refusal. Still no jargon, and still no claim about
  // whether the address exists.
  return { text: GENERIC_TEXT, action: 'none' };
};
