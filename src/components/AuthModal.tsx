import React, { useCallback, useEffect, useRef, useState } from 'react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resendConfirmationEmail, getEmailConfirmationStatus, abandonPendingOAuth, User } from '../services/auth.ts';
import { syncOnLogin } from '../services/cloudSync.ts';
import { GoogleIcon } from './Icons.tsx';
import { classifyAuthOutcome, isUnconfirmedEmailError } from '../utils/authOutcome.ts';
import { describeAuthFailure, AuthFailureAction } from '../utils/authMessages.ts';
import { openMailApp } from '../utils/openMail.ts';
import { supabase } from '../supabase.ts';

/** How often the waiting panel asks the server whether the account confirmed. */
const CONFIRMATION_POLL_MS = 3000;

/**
 * How long the Google button may spin before the page decides the redirect never
 * happened. The redirect itself is near-instant, so a page still on screen after
 * this is one whose consent window was closed.
 */
const GOOGLE_STUCK_MS = 10_000;

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Opens the privacy policy over the sheet, for the consent line. */
  onOpenPrivacy?: () => void;
}

/** Where this build is served from, shown so consent names a real address. */
const serviceAddress = (): string => {
  try {
    return typeof window === 'undefined' ? '' : window.location.origin;
  } catch {
    return '';
  }
};

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess, onOpenPrivacy }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem('dukan-profile-name') || '' : ''));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  // Set when the failed attempt deserves a nudge towards creating an account.
  const [errorAction, setErrorAction] = useState<AuthFailureAction>('none');

  // Held in a ref so the effects below stay subscribed/polling across the
  // frequent re-renders of the app shell instead of tearing down every render.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  // Three paths can complete the same sign-in (form submit, the auth event, and
  // the poll). Supabase notifies listeners before the sign-in promise resolves,
  // so without this guard they can overlap and repeat the sync.
  const completedRef = useRef(false);

  // Cache the freshly authenticated identity and hand control back to the app.
  const completeSignIn = useCallback(async (user: User) => {
    if (completedRef.current) return;
    completedRef.current = true;
    localStorage.setItem('dukan-auth-user', JSON.stringify({
      id: user.id,
      email: user.email,
    }));
    localStorage.removeItem('dukan-guest-mode');
    try {
      await syncOnLogin([], [], user);
    } catch (err) {
      console.warn('Post-email auth sync error:', err);
    }
    onSuccessRef.current();
  }, []);

  // Auto-close the moment the confirmation link is opened in this browser: a
  // second tab on the same origin shares localStorage, so the session lands
  // here too. The email link now redirects back to this page (see auth.ts).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        await completeSignIn(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [completeSignIn]);

  // Closing Google's window leaves this page exactly as it was: no redirect
  // happened, so nothing ever resets the button and it spins until the tab is
  // reloaded. That is what reads as "the app keeps refreshing". Reset it as soon
  // as the page is back in front of the user with no session.
  useEffect(() => {
    if (!googleLoading) return;

    let settled = false;
    const reset = async () => {
      if (settled) return;
      if (document.visibilityState === 'hidden') return;

      let signedIn = false;
      try {
        const { data } = await supabase.auth.getSession();
        signedIn = Boolean(data?.session?.user);
      } catch {
        signedIn = false;
      }
      if (settled) return;
      if (signedIn) return; // the redirect did complete; the shell takes over

      settled = true;
      abandonPendingOAuth(false);
      setGoogleLoading(false);
      setError('Sign-in was cancelled. You can try again whenever you are ready.');
      setErrorAction('none');
    };

    const timer = window.setTimeout(reset, GOOGLE_STUCK_MS);
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('focus', reset);
    window.addEventListener('pageshow', reset);

    return () => {
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('focus', reset);
      window.removeEventListener('pageshow', reset);
    };
  }, [googleLoading]);

  // The confirmation can happen on another device, where the session it creates
  // is invisible to this browser — so ask the server whether the account is
  // confirmed yet, and finish the sign-in here ourselves. This is what makes a
  // laptop confirmation complete the sign-in on the phone, with no second tap.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    let stopped = false;

    const id = window.setInterval(async () => {
      const confirmed = await getEmailConfirmationStatus(email);
      if (stopped || !confirmed) return;
      window.clearInterval(id);

      // The account is confirmed. If the password is still in state, the
      // sign-in can finish right here. After a reload it is gone (it is
      // deliberately never persisted), so hand the user back the form.
      if (!password) {
        setAwaitingConfirmation(false);
        setIsSignUp(false);
        setError(null);
        setFormNotice('Your email is confirmed — enter your password to finish.');
        return;
      }

      const result = await signInWithEmail(email, password);
      if (result.user) {
        await completeSignIn(result.user);
        return;
      }

      setAwaitingConfirmation(false);
      setIsSignUp(false);
      setError(null);
      setFormNotice('Your email is confirmed — enter your password to finish.');
    }, CONFIRMATION_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [awaitingConfirmation, email, password, completeSignIn]);

  // Cooldown countdown for resending confirmation email
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setGoogleLoading(false);
    }
    // If successful, Supabase redirects the browser to Google OAuth consent
  };

  const handleResend = async () => {
    if (!email || resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    setResendStatus(null);
    setError(null);
    setErrorAction('none');

    const res = await resendConfirmationEmail(email);
    setResendLoading(false);

    if (res.success) {
      setResendStatus('Confirmation link resent! Check your inbox and spam folder.');
      setResendCooldown(30);
    } else {
      setError(res.error || 'Failed to resend confirmation email.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    if (isSignUp && !fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    setErrorAction('none');
    setResendStatus(null);
    setFormNotice(null);

    const result = isSignUp
      ? await signUpWithEmail(email, password, fullName)
      : await signInWithEmail(email, password);

    const outcome = classifyAuthOutcome(result);

    if (outcome === 'confirm-email') {
      // The account exists, but Supabase requires email confirmation, so there
      // is no session yet. Ask for the confirmation instead of continuing.
      setAwaitingConfirmation(true);
      setLoading(false);
      return;
    }

    if (outcome === 'signed-in' && result.user) {
      await completeSignIn(result.user);
      return;
    }

    // A pending account that has not confirmed yet is not a failure — show the
    // confirmation panel instead of a raw "Email not confirmed" error.
    if (isUnconfirmedEmailError(result.error)) {
      setAwaitingConfirmation(true);
      setLoading(false);
      return;
    }

    // Never show the provider's own text: it is English-only API jargon, and it
    // says "invalid login credentials" for an address that simply has no
    // account — which reads like the user's fault.
    const copy = describeAuthFailure({
      message: result.error,
      code: result.code,
      status: result.status,
      isSignUp,
    });
    setError(copy.text);
    setErrorAction(copy.action);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-[#1A1A1A] w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-neutral-800">
        <div className="p-6 relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          
          <div className="text-center mb-5 mt-1">
            <h2 className="text-2xl font-bold text-white mb-1.5">Sync Your Store</h2>
            <p className="text-neutral-400 text-xs leading-relaxed">
              Sign in with Google or email to store your products, orders, and business data in Supabase cloud.
            </p>
          </div>

          {awaitingConfirmation ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-[#E6E6FA]/10 border border-[#E6E6FA]/30 rounded-2xl flex items-center justify-center mx-auto mb-3 text-[#E6E6FA]">
                <span className="material-symbols-outlined text-2xl">mark_email_unread</span>
              </div>
              <p className="text-white font-bold text-base mb-1">Check your email</p>
              <p className="text-neutral-400 text-xs leading-relaxed mb-3">
                We sent a confirmation email to <span className="text-white font-medium">{email}</span>.
                Tap the link on any device — this screen signs you in automatically.
              </p>

              {resendStatus && (
                <div className="mb-3 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs text-left flex items-start space-x-2">
                  <span className="material-symbols-outlined text-sm text-emerald-400 mt-0.5 flex-shrink-0">check_circle</span>
                  <span>{resendStatus}</span>
                </div>
              )}

              {error && (
                <div className="mb-3 p-2.5 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400 text-xs text-left flex items-start space-x-2">
                  <span className="material-symbols-outlined text-sm text-red-400 mt-0.5 flex-shrink-0">error</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2 mt-2">
                <button
                  type="button"
                  onClick={openMailApp}
                  className="w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity text-xs flex items-center justify-center space-x-2"
                >
                  <span className="material-symbols-outlined text-base">mail</span>
                  <span>Open Gmail</span>
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || resendCooldown > 0}
                  className="w-full bg-neutral-850 hover:bg-neutral-800 text-white font-medium py-2.5 rounded-xl transition-colors text-xs flex items-center justify-center space-x-2 disabled:opacity-50 border border-neutral-700"
                >
                  {resendLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : resendCooldown > 0 ? (
                    <span className="text-neutral-400">Resend email in {resendCooldown}s</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">send</span>
                      <span>Resend confirmation email</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAwaitingConfirmation(false);
                    setIsSignUp(false);
                    setError(null);
                    setErrorAction('none');
                    setResendStatus(null);
                  }}
                  className="w-full text-neutral-400 hover:text-white py-2 text-xs transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : (
            <>
          {/* Google Auth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full bg-white hover:bg-neutral-100 text-gray-800 font-semibold py-3 px-4 rounded-xl flex items-center justify-center space-x-3 transition-colors shadow-sm disabled:opacity-50"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <GoogleIcon className="w-5 h-5 flex-shrink-0" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Consent line. Google's own consent screen is configured in the
              Google/Supabase dashboards; this is the in-app half, so the person
              signing in knows what they are agreeing to and where the service
              actually lives. */}
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 text-center">
            By continuing you agree to our{' '}
            <button
              type="button"
              onClick={() => onOpenPrivacy?.()}
              className="text-neutral-300 underline underline-offset-2 hover:text-white"
            >
              Privacy Policy
            </button>
            {serviceAddress() && (
              <>
                {' '}· <span className="break-all">{serviceAddress()}</span>
              </>
            )}
          </p>

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-neutral-800"></div>
            <span className="px-3 text-xs text-neutral-500 uppercase tracking-wider font-medium">or email</span>
            <div className="flex-1 border-t border-neutral-800"></div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isSignUp && (
              <div>
                <input
                  type="text"
                  placeholder="Full name (Required)"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#E6E6FA] transition-colors"
                />
              </div>
            )}
            <div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#E6E6FA] transition-colors"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#E6E6FA] transition-colors"
              />
            </div>

            {formNotice && (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs text-left flex items-start space-x-2">
                <span className="material-symbols-outlined text-sm text-emerald-400 mt-0.5 flex-shrink-0">check_circle</span>
                <span>{formNotice}</span>
              </div>
            )}

            {error && (
              <div className="py-1.5 px-2.5 bg-red-950/30 rounded-lg border border-red-900/50">
                <p className="text-red-400 text-xs text-center leading-relaxed">{error}</p>
                {/* Supabase cannot tell a wrong password from an address that
                    has no account, so the useful move is to offer signup with
                    the address already typed rather than guess. */}
                {errorAction === 'sign-up' && !isSignUp && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                      setErrorAction('none');
                      setFormNotice(null);
                    }}
                    className="mt-1.5 w-full text-[#E6E6FA] text-xs font-semibold text-center underline underline-offset-2"
                  >
                    Sign up with this email instead
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center mt-1 text-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                isSignUp ? 'Sign Up with Email' : 'Sign In with Email'
              )}
            </button>
            
            <div className="text-center mt-3">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setErrorAction('none');
                  setFormNotice(null);
                }}
                className="text-neutral-400 text-xs hover:text-white transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </form>
            </>
          )}

          {/* Guest Mode Option */}
          <div className="mt-5 pt-3 border-t border-neutral-800">
            <button
              onClick={onClose}
              className="w-full bg-transparent border border-neutral-800 text-neutral-400 text-sm font-medium py-2 rounded-xl hover:bg-neutral-800/60 hover:text-white transition-all flex items-center justify-center"
            >
              Continue as Guest (Local Only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;