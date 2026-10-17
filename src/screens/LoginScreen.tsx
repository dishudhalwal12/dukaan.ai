import React, { useState } from 'react';
import { GoogleIcon } from '../components/Icons.tsx';
import { signInWithGoogle } from '../services/auth.ts';

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
      <div className="p-8 text-center">
        <h1 className="text-4xl font-bold text-[#E6E6FA]">Dukan.AI</h1>
      </div>
      <div className="flex-grow flex flex-col justify-center items-center p-8 text-center">
        <div className="w-64 h-48 bg-neutral-900 rounded-2xl flex items-center justify-center mb-8 border border-neutral-800">
          <div className="w-32 h-40 bg-neutral-800 rounded-xl shadow-md p-3 flex flex-col space-y-2 border border-neutral-700">
            <div className="w-full h-4 bg-emerald-500/40 rounded-sm"></div>
            <div className="w-full h-4 bg-amber-500/40 rounded-sm"></div>
            <div className="w-3/4 h-4 bg-indigo-500/40 rounded-sm"></div>
            <div className="flex-grow"></div>
            <div className="w-1/2 h-2 bg-neutral-600 rounded-sm"></div>
            <div className="w-full h-2 bg-neutral-600 rounded-sm"></div>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white">अपने दुकान को दो AI की शक्ति।</h2>
        <p className="text-sm text-neutral-400 mt-2">Give your business AI Superpowers with cloud sync.</p>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
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