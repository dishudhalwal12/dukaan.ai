import React, { useEffect, useMemo, useRef, useState } from 'react';
import { confirmEmail } from '../services/auth.ts';
import { ConfirmParams } from '../utils/confirmLink.ts';
import { browserHandoffUrl, isInAppWebView, isIos } from '../utils/openInBrowser.ts';

interface EmailConfirmScreenProps {
  params: ConfirmParams;
  /** Error Supabase left in the URL (an expired or reused link), if any. */
  authError?: string | null;
  /** Leaves the confirmation screen: clears the token from the URL and shows the app. */
  onContinue: () => void;
}

type ConfirmState = 'verifying' | 'confirmed' | 'failed';

/**
 * The page a confirmation link lands on.
 *
 * It exists because the link can be opened anywhere — Gmail's in-app browser,
 * Chrome, a different device — and the default Supabase redirect only works in
 * the browser that started the signup. Here the token is verified with
 * `verifyOtp`, which needs no PKCE verifier, so confirming succeeds wherever the
 * link was opened. Whether it was opened in the "right" browser no longer
 * decides whether the account is confirmed.
 *
 * The in-app browser hand-off below is a convenience on top of that, never a
 * prerequisite: Android can be sent to Chrome explicitly, iOS can only be asked.
 */
const EmailConfirmScreen: React.FC<EmailConfirmScreenProps> = ({ params, authError, onContinue }) => {
  const [state, setState] = useState<ConfirmState>(authError ? 'failed' : 'verifying');
  const [message, setMessage] = useState<string | null>(authError ?? null);

  // Guard against verifying the same token twice. React StrictMode re-runs
  // effects in development, and a token is single-use: the second call would
  // report "invalid link" over a confirmation that actually succeeded.
  const attempted = useRef(false);

  useEffect(() => {
    if (authError || attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    (async () => {
      const result = await confirmEmail(params.tokenHash, params.type);
      if (cancelled) return;
      if (result.error) {
        setMessage(result.error);
        setState('failed');
      } else {
        setState('confirmed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authError, params.tokenHash, params.type]);

  // A link tapped in Gmail opens in Gmail's browser: a different storage
  // sandbox. Offer the real browser, and say plainly that it is optional.
  const handoff = useMemo(() => {
    if (typeof navigator === 'undefined' || !isInAppWebView(navigator.userAgent)) return null;
    const href = typeof window !== 'undefined' ? window.location.href : '';
    return isIos(navigator.userAgent)
      ? { kind: 'ios' as const, href: null }
      : { kind: 'android' as const, href: browserHandoffUrl(href) };
  }, []);

  return (
    <div className="min-h-screen bg-black flex justify-center">
      <div className="w-full max-w-[460px] relative bg-black text-white flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-sm bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-6 text-center">
          {state === 'verifying' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#E6E6FA] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-white font-bold text-base mb-1">Confirming your email</p>
              <p className="text-neutral-400 text-xs leading-relaxed">Just a moment…</p>
            </>
          )}

          {state === 'confirmed' && (
            <>
              <div className="w-12 h-12 bg-[#E6E6FA]/10 border border-[#E6E6FA]/30 rounded-2xl flex items-center justify-center mx-auto mb-3 text-[#E6E6FA]">
                <span className="material-symbols-outlined text-2xl">check_circle</span>
              </div>
              <p className="text-white font-bold text-base mb-1">Email confirmed</p>
              <p className="text-neutral-400 text-xs leading-relaxed">
                You're all set. Any device where you signed in will finish signing in on its own.
              </p>
              <button
                type="button"
                onClick={onContinue}
                className="mt-6 w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity text-sm"
              >
                Go to app
              </button>
            </>
          )}

          {state === 'failed' && (
            <>
              <div className="w-12 h-12 bg-red-950/40 border border-red-900/60 rounded-2xl flex items-center justify-center mx-auto mb-3 text-red-400">
                <span className="material-symbols-outlined text-2xl">error</span>
              </div>
              <p className="text-white font-bold text-base mb-1">This link didn't work</p>
              <p className="text-red-400 text-xs leading-relaxed">
                {message || 'The confirmation link is invalid or has expired.'}
              </p>
              <p className="text-neutral-500 text-xs leading-relaxed mt-2">
                If you already confirmed, just sign in — otherwise request a new link from the sign-in screen.
              </p>
              <button
                type="button"
                onClick={onContinue}
                className="mt-6 w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity text-sm"
              >
                Go to sign in
              </button>
            </>
          )}

          {handoff && (
            <div className="mt-5 pt-4 border-t border-neutral-800 text-left">
              {handoff.kind === 'android' && handoff.href ? (
                <>
                  <p className="text-neutral-400 text-xs mb-2">
                    Opening in a mail app's browser? Open it properly instead:
                  </p>
                  <a
                    href={handoff.href}
                    className="w-full bg-transparent border border-neutral-700 text-white text-xs font-medium py-2.5 rounded-xl flex items-center justify-center space-x-2"
                  >
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                    <span>Open in Chrome</span>
                  </a>
                </>
              ) : (
                <p className="text-neutral-400 text-xs leading-relaxed">
                  Opening in a mail app's browser? Tap <span className="text-white">•••</span> and choose
                  <span className="text-white"> Open in Safari</span> — optional, this page confirms either way.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailConfirmScreen;