/**
 * Email-confirmation link parsing.
 *
 * The confirmation email points at our own route with the token in the URL, so
 * the app has to decide — before rendering anything — whether this page load is
 * a confirmation landing. That decision is pure string work and is kept here,
 * away from the component, so it can be tested without a browser.
 *
 * Why `token_hash` and not the default `{{ .ConfirmationURL }}`: the default
 * link's redirect is consumed with the PKCE `code_verifier`, which lives in the
 * browser that STARTED the signup. A link opened in another browser (Gmail's
 * in-app webview, a different device) has no verifier and cannot complete that
 * exchange. `token_hash` is verified by `verifyOtp` with no verifier at all, so
 * the link works wherever it is opened.
 */

/**
 * The link types this app's confirmation route handles. A `recovery` or
 * `invite` link carries the same `token_hash` shape but belongs to a different
 * flow, so it must not be claimed here.
 */
export const CONFIRM_TYPES = ['signup', 'email', 'email_change'] as const;

export interface ConfirmParams {
  tokenHash: string;
  type: string;
}

/**
 * Query string and hash fragment merged, fragment winning. Supabase delivers
 * auth parameters in either place depending on the flow.
 */
const paramsFor = (href: string): URLSearchParams => {
  const url = new URL(href);
  const merged = new URLSearchParams(url.search);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (hash) {
    for (const [key, value] of new URLSearchParams(hash)) {
      merged.set(key, value);
    }
  }
  return merged;
};

/**
 * The confirmation payload carried by `href`, or null when this URL is not a
 * confirmation landing. A token with no usable type is not a payload: acting on
 * it would verify the wrong flow.
 */
export const readEmailConfirmParams = (href: string): ConfirmParams | null => {
  try {
    const params = paramsFor(href);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (!tokenHash || !type) return null;
    if (!(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
    return { tokenHash, type };
  } catch {
    // A malformed href is simply not a confirmation link.
    return null;
  }
};

/**
 * Whether the status endpoint reported the account as confirmed. Only an
 * explicit boolean `true` counts — a stringified or numeric flag is not the
 * contract.
 */
export const parseConfirmationStatus = (body: unknown): boolean =>
  typeof body === 'object' &&
  body !== null &&
  (body as { confirmed?: unknown }).confirmed === true;

/**
 * Auth parameters worth removing once they have been read.
 *
 * `token_hash` is a single-use credential: anyone who reads it off the screen can
 * spend it. `type` only means anything beside it. The `error*` keys are left
 * over from a refused callback and would otherwise re-raise the same message on
 * every reload.
 */
const AUTH_PARAMS = ['token_hash', 'type', 'error', 'error_code', 'error_description'] as const;

/**
 * The same page with the auth parameters stripped out of the query string and
 * the fragment.
 *
 * Used the instant a confirmation link is read, so the token never sits in the
 * address bar while the network round trip to Supabase is in flight — it is
 * visible there for as long as the request takes, which on a phone is seconds.
 * An emptied fragment is dropped rather than left as a bare `#`.
 */
export const cleanConfirmUrl = (href: string): string => {
  try {
    const url = new URL(href);
    for (const key of AUTH_PARAMS) url.searchParams.delete(key);

    // Only a fragment that is a parameter list is touched. The app also routes
    // on plain hashes like `#orders`, and parsing one of those as parameters
    // turns it into `#orders=`.
    if (url.hash.length > 1 && url.hash.includes('=')) {
      const hashParams = new URLSearchParams(url.hash.slice(1));
      for (const key of AUTH_PARAMS) hashParams.delete(key);
      const remaining = hashParams.toString();
      url.hash = remaining ? `#${remaining}` : '';
    }

    const query = url.searchParams.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  } catch {
    // An unparseable href is left alone; there is nothing sensible to clean.
    return href;
  }
};

/**
 * Reads the confirmation payload from the page URL **once**, and scrubs the URL
 * on the way out.
 *
 * The result is cached for the lifetime of the page because the URL is cleaned
 * as part of reading it: a second call would otherwise find nothing and report
 * "this is not a confirmation link". Caching also makes the React StrictMode
 * double-render harmless, which matters because the token is single-use.
 */
let capturedParams: ConfirmParams | null | undefined;

export const captureEmailConfirmParams = (): ConfirmParams | null => {
  if (capturedParams !== undefined) return capturedParams;
  if (typeof window === 'undefined') {
    capturedParams = null;
    return capturedParams;
  }

  const params = readEmailConfirmParams(window.location.href);
  capturedParams = params;
  if (params) {
    window.history.replaceState({}, document.title, cleanConfirmUrl(window.location.href));
  }
  return params;
};


/** One verification per token, shared by every caller. */
const attempts = new Map<string, Promise<unknown>>();

/**
 * Runs a token's verification at most once, and gives every caller that same
 * outcome.
 *
 * React StrictMode runs an effect twice in development, and a confirmation token
 * is single-use: the second `verifyOtp` would be answered "invalid link" and
 * would paint a failure over a confirmation that had actually succeeded. Sharing
 * the in-flight promise — rather than refusing the second call — also means a
 * re-render or a re-mount shows the settled outcome instead of restarting the
 * flow and stranding the spinner.
 */
export const confirmTokenOnce = <T>(
  tokenHash: string,
  type: string,
  run: () => Promise<T>,
): Promise<T> => {
  const key = `${type}:${tokenHash}`;
  const existing = attempts.get(key);
  if (existing) return existing as Promise<T>;

  // Promise.resolve().then() so a synchronous throw becomes a rejection that
  // every caller of this token observes, instead of escaping the first one.
  const attempt = Promise.resolve().then(run);
  attempts.set(key, attempt);
  return attempt;
};