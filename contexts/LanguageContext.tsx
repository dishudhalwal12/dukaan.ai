
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';

// Define translations structure
interface Translations {
  [key: string]: string;
}

// Define the context shape
interface LanguageContextType {
  language: string;
  setLanguage: (language: string) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// The provider component
export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem('dukan-language') || 'en';
    } catch {
      return 'en';
    }
  });
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
      localStorage.setItem('dukan-language', lang);
      setLanguageState(lang);
    } catch (error) {
      console.error("Could not save language to localStorage", error);
    }
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

  const value = { language, setLanguage, t };

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