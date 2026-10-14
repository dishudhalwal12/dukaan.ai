import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../services/auth.ts';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    let user = null;
    if (isSignUp) {
      user = await signUpWithEmail(email, password);
    } else {
      user = await signInWithEmail(email, password);
    }

    if (user) {
      onSuccess();
    } else {
      setError(
        isSignUp 
          ? "Failed to create account. Please try again." 
          : "Invalid email or password. Please try again."
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
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          
          <div className="text-center mb-6 mt-2">
            <h2 className="text-2xl font-bold text-white mb-2">Sync Your Store</h2>
            <p className="text-neutral-400 text-sm">
              Create an account to securely save and access your data anywhere.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E6E6FA] transition-colors"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E6E6FA] transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-xl hover:bg-opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </button>
            
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-neutral-400 text-sm hover:text-white transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-neutral-800">
            <button
              onClick={onClose}
              className="w-full bg-transparent border border-neutral-700 text-neutral-300 font-medium py-2.5 rounded-xl hover:bg-neutral-800 hover:text-white transition-all"
            >
              Continue as Guest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
