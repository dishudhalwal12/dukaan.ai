import React from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import { useLanguage } from '../../contexts/LanguageContext.tsx';
import { LANGUAGES as languages } from '../../data/languages.ts';

const ChangeLanguageScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { language: selectedLanguage, setLanguage, t } = useLanguage();

  const handleSelectLanguage = (code: string) => {
    setLanguage(code);
  };

  return (
    <div>
      <SettingsSubHeader title={t('change_language_title')} onBack={onBack} />
      <div className="p-4 space-y-2">
        {languages.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleSelectLanguage(lang.code)}
            className="w-full flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg text-left transition-colors active:bg-neutral-800"
            aria-pressed={selectedLanguage === lang.code}
          >
            <div>
              <p className="font-semibold text-white">{lang.name}</p>
              <p className="text-sm text-neutral-400">{lang.nativeName}</p>
            </div>
            {selectedLanguage === lang.code && (
              <span className="material-symbols-outlined text-2xl text-[#E6E6FA]">check_circle</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-neutral-500 p-4 mt-4">
          {t('change_language_footer')}
      </p>
    </div>
  );
};

export default ChangeLanguageScreen;