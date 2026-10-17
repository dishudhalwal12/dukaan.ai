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