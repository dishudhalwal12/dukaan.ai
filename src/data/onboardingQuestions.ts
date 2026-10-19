/**
 * The three questions shown while the personalized questionnaire is still being
 * written, and the floor when it cannot be written at all.
 *
 * They are deliberately the same for every shop: the shopkeeper can start
 * answering immediately, and the AI questions replace the unanswered ones a few
 * seconds later. Every shipped language has its own set so nobody is forced to
 * read English while waiting.
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

const ENGLISH: FallbackQuestion[] = [
  {
    title: 'What is the biggest problem in your shop right now?',
    subtext: 'Pick up to two',
    type: 'select',
    options: ['Goods spoil', 'Hard to collect credit', 'Not enough new customers', "Can't track money"],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'How do you keep your accounts?',
    type: 'select',
    options: ['In a notebook', 'On a mobile app', 'In my memory', "I don't write it down"],
    intent: 'record_keeping',
  },
  {
    title: 'What do you want to improve the most?',
    type: 'select',
    options: ['Increase sales', 'Reduce losses', 'Keep customers', 'Make work easier'],
    intent: 'primary_goal',
  },
];

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

const URDU: FallbackQuestion[] = [
  {
    title: 'آپ کی دکان کا سب سے بڑا مسئلہ کیا ہے؟',
    subtext: 'دو تک چن سکتے ہیں',
    type: 'select',
    options: ['سامان خراب ہو جاتا ہے', 'ادھار وصول کرنا مشکل ہے', 'نئے گاہک نہیں آتے', 'پیسوں کا حساب نہیں رہتا'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'آپ حساب کتاب کیسے رکھتے ہیں؟',
    type: 'select',
    options: ['کاپی میں لکھتے ہیں', 'موبائل ایپ میں', 'یاد رکھتے ہیں', 'کچھ نہیں لکھتے'],
    intent: 'record_keeping',
  },
  {
    title: 'آپ سب سے زیادہ کیا بہتر کرنا چاہتے ہیں؟',
    type: 'select',
    options: ['بکری بڑھانا', 'نقصان کم کرنا', 'گاہک برقرار رکھنا', 'کام آسان بنانا'],
    intent: 'primary_goal',
  },
];

const TAMIL: FallbackQuestion[] = [
  {
    title: 'உங்கள் கடையில் இப்போது மிகப்பெரிய பிரச்சனை என்ன?',
    subtext: 'இரண்டு வரை தேர்ந்தெடுக்கலாம்',
    type: 'select',
    options: ['பொருட்கள் கெட்டுப் போகின்றன', 'கடன் வசூலிப்பது கஷ்டம்', 'புதிய வாடிக்கையாளர்கள் வருவதில்லை', 'பணக் கணக்கு வைக்க முடிவதில்லை'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'நீங்கள் கணக்கை எப்படி வைத்திருக்கிறீர்கள்?',
    type: 'select',
    options: ['நோட்டுப் புத்தகத்தில்', 'மொபைல் ஆப்பில்', 'நினைவில்', 'எதுவும் எழுதுவதில்லை'],
    intent: 'record_keeping',
  },
  {
    title: 'நீங்கள் எதை மிகவும் மேம்படுத்த விரும்புகிறீர்கள்?',
    type: 'select',
    options: ['விற்பனையை அதிகரிக்க', 'நஷ்டத்தைக் குறைக்க', 'வாடிக்கையாளர்களைத் தக்கவைக்க', 'வேலையை எளிதாக்க'],
    intent: 'primary_goal',
  },
];

const PUNJABI: FallbackQuestion[] = [
  {
    title: 'ਤੁਹਾਡੀ ਦੁਕਾਨ ਦੀ ਸਭ ਤੋਂ ਵੱਡੀ ਸਮੱਸਿਆ ਕੀ ਹੈ?',
    subtext: 'ਦੋ ਤੱਕ ਚੁਣ ਸਕਦੇ ਹੋ',
    type: 'select',
    options: ['ਸਮਾਨ ਖਰਾਬ ਹੋ ਜਾਂਦਾ ਹੈ', 'ਉਧਾਰ ਵਸੂਲਣਾ ਮੁਸ਼ਕਲ ਹੈ', 'ਨਵੇਂ ਗਾਹਕ ਨਹੀਂ ਆਉਂਦੇ', 'ਪੈਸਿਆਂ ਦਾ ਹਿਸਾਬ ਨਹੀਂ ਰਹਿੰਦਾ'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'ਤੁਸੀਂ ਹਿਸਾਬ-ਕਿਤਾਬ ਕਿਵੇਂ ਰੱਖਦੇ ਹੋ?',
    type: 'select',
    options: ['ਕਾਪੀ ਵਿੱਚ ਲਿਖਦੇ ਹੋ', 'ਮੋਬਾਈਲ ਐਪ ਵਿੱਚ', 'ਯਾਦ ਰੱਖਦੇ ਹੋ', 'ਕੁਝ ਨਹੀਂ ਲਿਖਦੇ'],
    intent: 'record_keeping',
  },
  {
    title: 'ਤੁਸੀਂ ਸਭ ਤੋਂ ਵੱਧ ਕੀ ਸੁਧਾਰਨਾ ਚਾਹੁੰਦੇ ਹੋ?',
    type: 'select',
    options: ['ਵਿਕਰੀ ਵਧਾਉਣਾ', 'ਨੁਕਸਾਨ ਘਟਾਉਣਾ', 'ਗਾਹਕ ਬਣਾਈ ਰੱਖਣਾ', 'ਕੰਮ ਆਸਾਨ ਬਣਾਉਣਾ'],
    intent: 'primary_goal',
  },
];

const GUJARATI: FallbackQuestion[] = [
  {
    title: 'તમારી દુકાનની સૌથી મોટી સમસ્યા શું છે?',
    subtext: 'બે સુધી પસંદ કરી શકો છો',
    type: 'select',
    options: ['સામાન બગડી જાય છે', 'ઉધાર વસૂલવું મુશ્કેલ છે', 'નવા ગ્રાહકો આવતા નથી', 'પૈસાનો હિસાબ રહેતો નથી'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'તમે હિસાબ કેવી રીતે રાખો છો?',
    type: 'select',
    options: ['કોપીમાં લખો છો', 'મોબાઇલ એપમાં', 'યાદ રાખો છો', 'કંઈ લખતા નથી'],
    intent: 'record_keeping',
  },
  {
    title: 'તમે સૌથી વધુ શું સુધારવા માગો છો?',
    type: 'select',
    options: ['વેચાણ વધારવું', 'નુકસાન ઘટાડવું', 'ગ્રાહકો ટકાવવા', 'કામ સરળ બનાવવું'],
    intent: 'primary_goal',
  },
];

const KANNADA: FallbackQuestion[] = [
  {
    title: 'ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಈಗ ಅತಿದೊಡ್ಡ ಸಮಸ್ಯೆ ಏನು?',
    subtext: 'ಎರಡರವರೆಗೆ ಆಯ್ಕೆ ಮಾಡಬಹುದು',
    type: 'select',
    options: ['ಸರಕು ಹಾಳಾಗುತ್ತದೆ', 'ಸಾಲ ವಸೂಲಿ ಕಷ್ಟ', 'ಹೊಸ ಗ್ರಾಹಕರು ಬರುವುದಿಲ್ಲ', 'ಹಣದ ಲೆಕ್ಕ ಇರುವುದಿಲ್ಲ'],
    multiSelect: true,
    intent: 'primary_challenge',
  },
  {
    title: 'ನೀವು ಲೆಕ್ಕವನ್ನು ಹೇಗೆ ಇಡುತ್ತೀರಿ?',
    type: 'select',
    options: ['ನೋಟ್ಬುಕ್ನಲ್ಲಿ', 'ಮೊಬೈಲ್ ಆಪ್ನಲ್ಲಿ', 'ನೆನಪಿನಲ್ಲಿ', 'ಏನೂ ಬರೆಯುವುದಿಲ್ಲ'],
    intent: 'record_keeping',
  },
  {
    title: 'ನೀವು ಯಾವುದನ್ನು ಹೆಚ್ಚು ಸುಧಾರಿಸಲು ಬಯಸುತ್ತೀರಿ?',
    type: 'select',
    options: ['ಮಾರಾಟ ಹೆಚ್ಚಿಸಲು', 'ನಷ್ಟ ಕಡಿಮೆ ಮಾಡಲು', 'ಗ್ರಾಹಕರನ್ನು ಉಳಿಸಿಕೊಳ್ಳಲು', 'ಕೆಲಸ ಸುಲಭ ಮಾಡಲು'],
    intent: 'primary_goal',
  },
];

const BY_LANGUAGE: Record<string, FallbackQuestion[]> = {
  en: ENGLISH,
  hi: HINDI,
  ur: URDU,
  ta: TAMIL,
  pa: PUNJABI,
  gu: GUJARATI,
  kn: KANNADA,
};

/**
 * The fixed question set for `language`.
 *
 * Falls back to English for an unknown code rather than returning null: the
 * questionnaire must never wait on a language the build does not recognise.
 */
export const localizedFallbackQuestions = (language?: string | null): FallbackQuestion[] => {
  const code = typeof language === 'string' ? language.trim().toLowerCase() : '';
  return BY_LANGUAGE[code] ?? ENGLISH;
};
