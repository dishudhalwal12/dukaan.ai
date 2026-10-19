import React, { useEffect, useState } from 'react';
import { confirmEmail } from '../services/auth.ts';
import { confirmTokenOnce } from '../utils/confirmLink.ts';
import type { ConfirmParams } from '../utils/confirmLink.ts';

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
 * The page does not refresh, redirect or open anything else. It used to offer an
 * "Open in Chrome" hand-off for mail-app browsers; that re-opened the very same
 * one-time link in a second tab, which spent the token twice and painted "This
 * link didn't work" over a confirmation that had actually succeeded. Opening a
 * second tab is exactly what this screen must not do, so the hand-off is gone.
 */
const EmailConfirmScreen: React.FC<EmailConfirmScreenProps> = ({ params, authError, onContinue }) => {
  const [state, setState] = useState<ConfirmState>(authError ? 'failed' : 'verifying');
  const [message, setMessage] = useState<string | null>(authError ?? null);

  // A confirmation token is single-use and StrictMode runs this effect twice, so
  // the spend goes through `confirmTokenOnce`: one `verifyOtp`, and every mount
  // sees its outcome. Awaiting the shared promise is also what keeps the second
  // StrictMode pass from stranding the spinner — the first pass's `alive` flag is
  // already false by then, so only the second pass writes state.
  useEffect(() => {
    if (authError) return;

    let alive = true;

    (async () => {
      const result = await confirmTokenOnce(params.tokenHash, params.type, () =>
        confirmEmail(params.tokenHash, params.type)
      );
      if (!alive) return;

      if (result.error) {
        setMessage(result.error);
        setState('failed');
        return;
      }

      setState('confirmed');
    })();

    return () => {
      alive = false;
    };
  }, [authError, params.tokenHash, params.type]);

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
              <p className="text-white font-bold text-base mb-1">Email verified</p>
              <p className="text-neutral-400 text-xs leading-relaxed">
                Your email address is now verified. You can now visit the app again.
              </p>
              <button
                type="button"
                onClick={onContinue}
                className="mt-6 w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity text-sm"
              >
                Visit the app
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
        </div>
      </div>
    </div>
  );
};

export default EmailConfirmScreen;
