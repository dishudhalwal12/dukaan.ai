/**
 * Email-confirmation helper: opens the device's mail app (Gmail on phones) so
 * the user can find the confirmation link, falling back to web Gmail when no
 * app handles the custom scheme.
 */

export type MailTarget = 'app' | 'web';

export const GMAIL_APP_URL = 'googlegmail://';
export const GMAIL_WEB_URL = 'https://mail.google.com/mail/u/0/#inbox';

const MOBILE_UA = /android|iphone|ipad|ipod/i;

/** Phones have a native Gmail app to deep-link into; desktops do not. */
export const mailTargetFor = (userAgent: string): MailTarget =>
  MOBILE_UA.test(userAgent) ? 'app' : 'web';

/**
 * Navigates to the mail app. A custom scheme silently no-ops when nothing
 * handles it, so arm a short fallback to web Gmail and cancel it if the page
 * is backgrounded — which is what happens when an app does open.
 */
export const openMailApp = (): void => {
  if (typeof window === 'undefined') return;

  if (mailTargetFor(navigator.userAgent) === 'web') {
    window.open(GMAIL_WEB_URL, '_blank', 'noopener');
    return;
  }

  const fallback = window.setTimeout(() => {
    window.location.href = GMAIL_WEB_URL;
  }, 800);
  document.addEventListener('visibilitychange', () => window.clearTimeout(fallback), { once: true });
  window.location.href = GMAIL_APP_URL;
};