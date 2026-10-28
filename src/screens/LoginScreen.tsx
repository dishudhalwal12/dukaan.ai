import React, { useState } from 'react';
import { GoogleIcon } from '../components/Icons.tsx';
import { signInWithGoogle } from '../services/auth.ts';
import { BRAND } from '../config/brand.ts';

interface LoginScreenProps {
  onLogin: () => void;
  onGuestContinue?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onGuestContinue }) => {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-black text-white">
      {/* The mark carries the brand; no alt text, because the wordmark below it
          says the same thing and a screen reader would read the name twice. */}
      <div className="p-8 text-center">
        <img src="/brand/nukkad-glyph.svg" alt="" width={64} height={64} className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-accent">{BRAND.wordmark}</h1>
        <p className="mt-2 text-sm font-medium text-neutral-400">{BRAND.descriptor}</p>
      </div>
      <div className="flex-grow flex flex-col justify-center items-center p-8 text-center">
        {/* This used to be a hardcoded Devanagari line, so an English reader and a
            Tamil reader both got Hindi. The tagline is brand voice: it stays in
            one language on purpose, and it is now the same string as the app
            title, the social card and the store listing. */}
        <h2 className="text-2xl font-bold leading-snug text-white">{BRAND.tagline}</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm text-neutral-400">{BRAND.description}</p>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>
      <div className="p-6 space-y-3">
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full bg-white text-gray-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center text-base shadow-md hover:bg-neutral-100 transition-colors disabled:opacity-50"
        >
          {googleLoading ? (
            <div className="w-5 h-5 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <GoogleIcon className="w-5 h-5 mr-3" />
              Continue with Google
            </>
          )}
        </button>

        <button
          onClick={onGuestContinue || onLogin}
          className="w-full bg-transparent border border-neutral-800 text-neutral-400 font-semibold py-3 px-4 rounded-xl text-sm hover:text-white hover:bg-neutral-900 transition-all"
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;