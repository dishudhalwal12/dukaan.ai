import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '../services/auth.ts';
import { claimUnassignedRecords, syncOnLogin } from '../services/cloudSync.ts';
import { GoogleIcon } from './Icons.tsx';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password);

    if (result.user) {
      // 1. Immediately cache user ID and email
      localStorage.setItem('dukan-auth-user', JSON.stringify({
        id: result.user.id,
        email: result.user.email,
      }));
      localStorage.removeItem('dukan-guest-mode');

      // 2. Explicitly claim unassigned records and sync under this user's UUID
      try {
        await claimUnassignedRecords(result.user.id);
        await syncOnLogin([], [], result.user);
      } catch (err) {
        console.warn('Post-email auth sync error:', err);
      }

      onSuccess();
    } else {
      setError(
        result.error ||
        (isSignUp 
          ? "Failed to create account. Please try again." 
          : "Invalid email or password. Please try again.")
      );
      setLoading(false);
    }
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
