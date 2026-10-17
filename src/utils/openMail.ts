/**
 * Email-confirmation helper: opens the device's mail app (Gmail on phones) so
 * the user can find the confirmation link, falling back to web Gmail when no
 * app handles the custom scheme.
 */

export type MailTarget = 'app' | 'web';

export const GMAIL_APP_URL = 'googlegmail://';
export const GMAIL_WEB_URL = 'https://mail.google.com/mail/u/0/#inbox';

/** Wide enough for a cold Gmail app launch before we give up and load web Gmail. */
export const MAIL_FALLBACK_MS = 1500;

const MOBILE_UA = /android|iphone|ipad|ipod/i;

/** Phones have a native Gmail app to deep-link into; desktops do not. */
export const mailTargetFor = (userAgent: string): MailTarget =>
  MOBILE_UA.test(userAgent) ? 'app' : 'web';

/**
 * Only a page that goes hidden has handed off to the app. Any other visibility
 * transition (a stray backgrounding) must keep the web fallback armed.
 */
export const shouldCancelMailFallback = (visibilityState: string): boolean =>
  visibilityState === 'hidden';

/**
 * Navigates to the mail app. A custom scheme silently no-ops when nothing
 * handles it, so arm a short fallback to web Gmail and cancel it only when the
 * page is actually backgrounded — which is what happens when an app opens.
 */
export const openMailApp = (): void => {
  if (typeof window === 'undefined') return;

  if (mailTargetFor(navigator.userAgent) === 'web') {
    window.open(GMAIL_WEB_URL, '_blank', 'noopener');
    return;
  }

  const fallback = window.setTimeout(() => {
    window.location.href = GMAIL_WEB_URL;
  }, MAIL_FALLBACK_MS);

  const cancel = () => window.clearTimeout(fallback);
  const onVisibility = () => {
    if (shouldCancelMailFallback(document.visibilityState)) {
      cancel();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', cancel, { once: true });
  window.location.href = GMAIL_APP_URL;
};