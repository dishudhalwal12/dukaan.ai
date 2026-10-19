/**
 * The questions asked when the AI questionnaire cannot be fetched.
 *
 * The live questionnaire comes from the model, in the shopkeeper's language. This
 * is the offline floor: it must never leave the screen blank, so a short fixed
 * set is kept for the languages the beta is actually being handed to.
 *
 * English keeps the category-aware questions built in `OnboardingFlow` — this
 * file only covers Hindi, the language the questionnaire was reported in. Any
 * other language falls back to the English set rather than showing nothing.
 */

export interface FallbackQuestion {
  title: string;
  subtext?: string;
  type: 'select' | 'input';
  options?: string[];
  multiSelect?: boolean;
  intent: string;
  placeholder?: string;
}

const HINDI: FallbackQuestion[] = [
  {
    title: 'आपकी दुकान की सबसे बड़ी परेशानी क्या है?',
    subtext: 'दो तक चुन सकते हैं',
    type: 'select',
    options: ['सामान खराब हो जाता है', 'उधार वसूलना मुश्किल है', 'नए ग्राहक नहीं आते', 'पैसों का हिसाब नहीं रहता'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'आप हिसाब-किताब कैसे रखते हैं?',
    type: 'select',
    options: ['कॉपी में लिखते हैं', 'मोबाइल ऐप में', 'याद रखते हैं', 'कुछ नहीं लिखते'],
    intent: 'record_keeping',
  },
  {
    title: 'आप सबसे ज़्यादा क्या सुधारना चाहते हैं?',
    type: 'select',
    options: ['बिक्री बढ़ाना', 'नुकसान कम करना', 'ग्राहक बनाए रखना', 'काम आसान बनाना'],
    intent: 'primary_goal',
  },
];

const BY_LANGUAGE: Record<string, FallbackQuestion[]> = {
  hi: HINDI,
};

/**
 * The fixed question set for `language`, or null when this language has no set
 * of its own and the caller should use the English questions it already builds.
 */
export const localizedFallbackQuestions = (language?: string | null): FallbackQuestion[] | null => {
  const code = typeof language === 'string' ? language.trim().toLowerCase() : '';
  return BY_LANGUAGE[code] ?? null;
};
