
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { isSupportedLanguage, shouldAdoptRemoteLanguage } from '../data/languages.ts';
import { saveMerchantPreferencesToCloud } from '../services/cloudSync.ts';

// Define translations structure
interface Translations {
  [key: string]: string;
}

// Define the context shape
interface LanguageContextType {
  language: string;
  /** Applies a choice the user just made, and records it against the account. */
  setLanguage: (language: string) => void;
  /**
   * Applies a language restored from the account. Ignored when this device
   * already holds a choice of its own, so a second device never overrides it.
   */
  applyRemoteLanguage: (language?: string | null) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANGUAGE_STORAGE_KEY = 'dukan-language';

/**
 * Set only when the user picked a language on THIS device.
 *
 * Without it there is no way to tell "never chose, has the default English" from
 * "chose English on purpose", and restoring the account's value would silently
 * undo a deliberate choice.
 */
export const LANGUAGE_CHOSEN_KEY = 'dukan-language-chosen';

const readStoredLanguage = (): string => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
  } catch {
    return 'en';
  }
};

const hasLocalChoice = (): boolean => {
  try {
    return localStorage.getItem(LANGUAGE_CHOSEN_KEY) === 'true';
  } catch {
    return false;
  }
};

// The provider component
export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(readStoredLanguage);
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    const fetchTranslations = async (lang: string) => {
      try {
        const response = await fetch(`./i18n/locales/${lang}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setTranslations(data);
      } catch (error) {
        console.error(`Could not load translations for ${lang}`, error);
        // Fallback to English if fetch fails
        if (lang !== 'en') {
            await fetchTranslations('en');
        }
      }
    };
    fetchTranslations(language);
  }, [language]);

  const setLanguage = (lang: string) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      localStorage.setItem(LANGUAGE_CHOSEN_KEY, 'true');
      setLanguageState(lang);
    } catch (error) {
      console.error("Could not save language to localStorage", error);
    }

    // Also store it against the account. This is the only write that survives a
    // reinstall, a cleared browser or a different phone — and it is deliberately
    // fire-and-forget: choosing a language must never wait on the network.
    // Guests are skipped inside the service (there is no account to write to).
    void saveMerchantPreferencesToCloud();
  };

  const applyRemoteLanguage = (remote?: string | null) => {
    if (!shouldAdoptRemoteLanguage(remote, hasLocalChoice())) return;

    const next = String(remote).trim().toLowerCase();
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the value still applies to this session.
    }
    setLanguageState(next);
  };

  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
    const value = translations[key];
    if (value === undefined) {
      console.warn(`Translation key "${key}" not found.`);
      return key;
    }
    // Simple interpolation (replace {{variable}} with value)
    if (options) {
      return Object.keys(options).reduce((acc, k) => {
        return acc.replace(new RegExp(`{{${k}}}`, 'g'), String(options[k]));
      }, value);
    }
    return value;
  }, [translations]);

  const value = { language, setLanguage, applyRemoteLanguage, t };

  // Only render children when translations are loaded to avoid flicker
  return (
    <LanguageContext.Provider value={value}>
      {Object.keys(translations).length > 0 ? children : null}
    </LanguageContext.Provider>
  );
};

// Custom hook to use the language context
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
