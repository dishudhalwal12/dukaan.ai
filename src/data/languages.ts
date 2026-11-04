/**
 * The languages the app ships translations for.
 *
 * One list, used by the onboarding language step and by Settings → Change
 * Language, so the two can never drift apart. `name` is the English name (for
 * the language you are not currently reading) and `nativeName` is what the
 * speaker actually calls it — a picker that only says "Gujarati" to a Gujarati
 * speaker is harder to use than one that says "ગુજરાતી".
 */

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
];

export const LANGUAGE_CODES: string[] = LANGUAGES.map((language) => language.code);

/** Static lookup table from supported language code to its bundled locale path. */
export const LOCALE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  en: './i18n/locales/en.json',
  hi: './i18n/locales/hi.json',
  ur: './i18n/locales/ur.json',
  ta: './i18n/locales/ta.json',
  pa: './i18n/locales/pa.json',
  gu: './i18n/locales/gu.json',
  kn: './i18n/locales/kn.json',
});

/** Resolves the bundled locale path for a language, falling back strictly to English. */
export const localePathFor = (code?: string | null): string => {
  if (isSupportedLanguage(code)) {
    const key = String(code).trim().toLowerCase();
    return LOCALE_PATHS[key] ?? LOCALE_PATHS.en;
  }
  return LOCALE_PATHS.en;
};

/** Whether a stored or remote code is one this build has translations for. */
export const isSupportedLanguage = (code?: string | null): boolean =>
  typeof code === 'string' && LANGUAGE_CODES.includes(code.trim().toLowerCase());

/**
 * Storage keys for language settings in browser localStorage.
 */
export const LANGUAGE_STORAGE_KEY = 'dukan-language';

/**
 * Set only when the user picked a language on THIS device.
 *
 * Without it there is no way to tell "never chose, has the default English" from
 * "chose English on purpose", and restoring the account's value would silently
 * undo a deliberate choice.
 */
export const LANGUAGE_CHOSEN_KEY = 'dukan-language-chosen';

/**
 * Reads the stored language code, validating it against supported languages.
 * If unknown, clears the storage key on read and falls back to 'en'.
 */
export const readStoredLanguage = (): string => {
  try {
    if (typeof localStorage === 'undefined') return 'en';
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!raw) return 'en';
    const normalized = raw.trim().toLowerCase();
    if (isSupportedLanguage(normalized)) {
      return normalized;
    }
    // Unknown or invalid stored code: clear from storage and fall back strictly to English
    try {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      localStorage.removeItem(LANGUAGE_CHOSEN_KEY);
    } catch {
      // Storage unavailable
    }
    return 'en';
  } catch {
    return 'en';
  }
};

/**
 * Whether a language restored from the account should be applied.
 *
 * A choice made on this device always wins: otherwise signing in on the phone
 * would overwrite the language the shopkeeper picked here five minutes ago with
 * whatever the account holds from another device. When there is no local choice
 * yet, the stored value is the best answer available.
 */
export const shouldAdoptRemoteLanguage = (
  remote?: string | null,
  hasLocalChoice: boolean = false,
): boolean => !hasLocalChoice && isSupportedLanguage(remote);

/** The option for `code`, or undefined. */
export const languageByCode = (code?: string | null): LanguageOption | undefined =>
  LANGUAGES.find((language) => language.code === code);
