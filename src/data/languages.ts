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
  /**
   * Reading direction. Urdu is the only right-to-left language this build
   * ships, and until this field existed the app translated the words but kept
   * the layout left-to-right: sentences ran to the wrong edge.
   */
  direction: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr' },
];

export const LANGUAGE_CODES: string[] = LANGUAGES.map((language) => language.code);

/** Whether a stored or remote code is one this build has translations for. */
export const isSupportedLanguage = (code?: string | null): boolean =>
  typeof code === 'string' && LANGUAGE_CODES.includes(code.trim().toLowerCase());

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

/** `rtl` only for Urdu, `ltr` for everything else and for an unknown code. */
export const languageDirection = (code?: string | null): 'ltr' | 'rtl' =>
  languageByCode(code)?.direction === 'rtl' ? 'rtl' : 'ltr';
