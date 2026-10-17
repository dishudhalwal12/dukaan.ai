/**
 * Opening a confirmed link in a real browser.
 *
 * A confirmation link tapped inside Gmail opens in Gmail's in-app browser: a
 * storage sandbox that is not the browser the user is signed into the app with,
 * and (on iOS) not even a browser that can be replaced. The durable fix is that
 * confirmation no longer needs the receiving browser at all — see
 * `confirmLink.ts`. This module is the best-effort extra: when we can tell the
 * page is inside an app webview, offer the real browser instead.
 *
 * Android accepts an `intent://` URL naming `com.android.chrome`, so the link
 * genuinely opens in Chrome. iOS has no equivalent — a web page cannot launch
 * another browser — so the caller shows instructions instead.
 *
 * Pure string work, no `window`, so it can be tested under plain node.
 */

/** App markers that identify an embedded webview rather than a standalone browser. */
const WEBVIEW_MARKERS = [
  '; wv)',
  'FBAN',
  'FBAV',
  'FB_IAB',
  'Instagram',
  'Twitter',
  'Line/',
  'GSA/',
];

export const isIos = (userAgent: string): boolean =>
  /iPhone|iPad|iPod/i.test(userAgent || '');

/**
 * Whether this user agent is an app-embedded browser.
 *
 * Android WebViews declare themselves plainly. On iOS the reliable signal is
 * `AppleWebKit` with no `Safari/` token: real Safari and the iOS builds of
 * Chrome and Firefox all keep `Safari/`.
 */
export const isInAppWebView = (userAgent: string): boolean => {
  const ua = userAgent || '';
  if (WEBVIEW_MARKERS.some((marker) => ua.includes(marker))) return true;
  return isIos(ua) && !ua.includes('Safari/');
};

/**
 * Auth parameters that must survive the hand-off when the link delivered them in
 * the fragment instead of the query string.
 */
const FRAGMENT_CARRIED_PARAMS = ['token_hash', 'type'];

/**
 * An Android `intent://` URL that opens `url` in Chrome, falling back to `url`
 * itself when Chrome is not installed.
 *
 * The target's own fragment is dropped: a `#` before `#Intent;` would end the
 * intent target early and lose the token. Auth parameters that were IN that
 * fragment are moved into the query first, so a fragment-delivered token still
 * reaches Chrome instead of navigating to a confirmation page with nothing to
 * confirm.
 */
export const browserHandoffUrl = (url: string): string => {
  try {
    const target = new URL(url);

    if (target.hash) {
      const hashParams = new URLSearchParams(target.hash.replace(/^#/, ''));
      for (const key of FRAGMENT_CARRIED_PARAMS) {
        const value = hashParams.get(key);
        if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
      }
    }

    const scheme = target.protocol.replace(':', '');
    target.hash = '';
    const fallback = encodeURIComponent(target.toString());
    const rest = `${target.host}${target.pathname}${target.search}`;
    return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  } catch {
    // An unparseable URL cannot be wrapped; leave it for the caller to use as-is.
    return url;
  }
};