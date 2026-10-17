import React, { useCallback, useEffect, useRef, useState } from 'react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resendConfirmationEmail, User } from '../services/auth.ts';
import { syncOnLogin } from '../services/cloudSync.ts';
import { GoogleIcon } from './Icons.tsx';
import { classifyAuthOutcome, isUnconfirmedEmailError } from '../utils/authOutcome.ts';
import { openMailApp } from '../utils/openMail.ts';
import { supabase } from '../supabase.ts';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

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

  // Safety net for when the auth event is not delivered to this tab: while the
  // confirmation panel is open, poll for the session the link set up.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    const id = window.setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        window.clearInterval(id);
        await completeSignIn(session.user);
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [awaitingConfirmation, completeSignIn]);

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

    setLoading(true);
    setError(null);
    setResendStatus(null);

    const result = isSignUp
      ? await signUpWithEmail(email, password)
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

    setError(
      result.error ||
      (isSignUp
        ? "Failed to create account. Please try again."
        : "Invalid email or password. Please try again.")
    );
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
                Open it and tap the link — you'll be signed in here automatically.
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

              <div className="space-y-2 mt-4">
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

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-neutral-800"></div>
            <span className="px-3 text-xs text-neutral-500 uppercase tracking-wider font-medium">or email</span>
            <div className="flex-1 border-t border-neutral-800"></div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
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

            {error && (
              <p className="text-red-400 text-xs text-center py-1 bg-red-950/30 rounded-lg border border-red-900/50">{error}</p>
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