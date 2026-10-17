import React from 'react';

interface WelcomeBackModalProps {
  name: string;
  onContinue: () => void;
}

/**
 * Shown once, after an interactive sign-in, to an account that has already
 * onboarded. Styled to match AuthModal.
 */
const WelcomeBackModal: React.FC<WelcomeBackModalProps> = ({ name, onContinue }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
    <div className="bg-[#1A1A1A] w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-neutral-800">
      <div className="p-6 text-center">
        <span className="material-symbols-outlined text-4xl text-[#E6E6FA] mb-3 block">storefront</span>
        <h2 className="text-2xl font-bold text-white mb-1.5">Welcome back, {name}!</h2>
        <p className="text-neutral-400 text-xs leading-relaxed">
          Your store is synced and ready.
        </p>
        <button
          onClick={onContinue}
          className="mt-6 w-full bg-[#E6E6FA] text-black font-semibold py-2.5 rounded-xl hover:bg-opacity-90 transition-opacity text-sm"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
);

export default WelcomeBackModal;
