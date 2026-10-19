/**
 * The spoken name of a language code.
 *
 * Prompts have to name the language ("Write in Hindi"), not pass a code: a model
 * given "hi" sometimes answers in English and then explains that it did. Kept in
 * one place because both the onboarding questionnaire and the dashboard insights
 * need it, and two copies would eventually disagree.
 */

const NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ur: 'Urdu',
  ta: 'Tamil',
  pa: 'Punjabi',
  gu: 'Gujarati',
  kn: 'Kannada',
};

/** Script-specific coaching, for prompts that must not fall back to Latin text. */
const SCRIPTS: Record<string, string> = {
  hi: 'Devanagari script',
  ur: 'Urdu (Nastaliq) script, written right to left',
  ta: 'Tamil script',
  pa: 'Gurmukhi script',
  gu: 'Gujarati script',
  kn: 'Kannada script',
  en: 'Latin script',
};

const normalize = (code?: string | null): string =>
  typeof code === 'string' ? code.trim().toLowerCase() : '';

/** "Hindi", or "English" for anything unrecognised. */
export const languageName = (code?: string | null): string => NAMES[normalize(code)] ?? NAMES.en;

/** "Devanagari script", or an empty string when the code is unknown. */
export const languageScript = (code?: string | null): string => SCRIPTS[normalize(code)] ?? '';

/**
 * One line telling a model exactly how to write in `code`.
 *
 * English needs no coaching: it is the language the instruction itself is
 * written in, so a "write in English" rule would just be noise.
 */
export const languageInstruction = (code?: string | null): string => {
  const name = languageName(code);
  const script = languageScript(code);
  if (name === NAMES.en) {
    return 'Write in simple English.';
  }
  return `Write in ${name}, in ${script}. Do not answer in English and do not mix English words into the questions or options.`;
};
