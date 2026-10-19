import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import { withGeminiFailover } from '../utils/geminiClient.ts';
import { saveBusinessProfileToCloud } from '../services/cloudSync.ts';
import { businessPresets } from '../data/businessPresets.ts';
import { sanitizeForPrompt } from '../utils/sanitize.ts';
import LocationModal from '../components/LocationModal.tsx';
import { saveStoreLocation } from '../utils/location.ts';
import { LANGUAGES } from '../data/languages.ts';
import { localizedFallbackQuestions } from '../data/onboardingQuestions.ts';
import { languageInstruction, languageName } from '../utils/languageName.ts';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const NameStep: React.FC<{ onNext: (name: string) => void }> = ({ onNext }) => {
  const [name, setName] = useState('');

  const handleContinue = () => {
    if (name.trim()) {
      onNext(name.trim());
    }
  };

  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-8 max-w-sm w-full text-center shadow-lg">
      <h2 className="text-white text-2xl font-bold mb-6">What should we call you?</h2>
      <div className="mb-6">
        <input
          autoFocus
          className="w-full bg-transparent border-t-0 border-x-0 border-b-2 border-neutral-600 text-white text-lg text-center py-2 focus:outline-none focus:ring-0 focus:border-[#E6E6FA] placeholder-neutral-400 transition-colors duration-300"
          placeholder="Enter your name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleContinue()}
        />
      </div>
      <button
        onClick={handleContinue}
        disabled={!name.trim()}
        className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
};

const StoreDetailsStep: React.FC<{ onNext: (details: { storeName: string; storeCategory: string }) => void }> = ({ onNext }) => {
  const [storeName, setStoreName] = useState('');
  const [storeCategory, setStoreCategory] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const { t } = useLanguage();

  // The store's position is asked for once the shop's identity is known, and
  // "Setup later" is offered because a shopkeeper who is not in the shop right
  // now must still be able to finish. The catalog re-asks before the first
  // product, where it cannot be deferred.
  //
  // There is deliberately no address box: the position is the address, and a
  // typed address was one more field to fight with on a phone keyboard while
  // standing behind a counter.
  const finish = () => {
    setShowLocationModal(false);
    onNext({ storeName, storeCategory });
  };

  const handleContinue = () => {
    if (storeName.trim() && storeCategory.trim()) {
      setShowLocationModal(true);
    }
  };
  
  const canContinue = Boolean(storeName.trim() && storeCategory.trim());

  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full text-center shadow-lg">
      <h2 className="text-white text-2xl font-bold mb-6">Set up your store</h2>
      <div className="space-y-6 text-left">
        <div>
          <label className="text-white font-bold" htmlFor="store-name">{t('label_store_name')}</label>
          <input
            autoFocus
            className="w-full bg-transparent border-t-0 border-x-0 border-b-2 border-neutral-600 text-white text-lg py-2 focus:outline-none focus:ring-0 focus:border-[#E6E6FA] placeholder-neutral-400 transition-colors duration-300"
            id="store-name"
            placeholder={t('placeholder_store_name_example')}
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-white font-bold" htmlFor="store-category">{t('label_store_category')}</label>
          <div className="relative mt-1">
            <select
              className="appearance-none w-full bg-transparent border-t-0 border-x-0 border-b-2 border-neutral-600 text-white text-lg py-2.5 focus:outline-none focus:ring-0 focus:border-[#E6E6FA] transition-colors duration-300"
              id="store-category"
              value={storeCategory}
              onChange={(e) => setStoreCategory(e.target.value)}
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23e6e6fa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.5em 1.5em' }}
            >
              <option className="bg-[#1A1A1A] text-white" value="">{t('onboarding_select_category')}</option>
              {businessPresets.map((preset) => (
                <option key={preset.key} className="bg-[#1A1A1A] text-white" value={preset.displayName}>{preset.displayName}</option>
              ))}
              {/* [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable
              <option className="bg-[#1A1A1A] text-white" value="Other Grocery">Other Grocery</option>
              */}
            </select>
          </div>
        </div>
      </div>
      <button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-opacity-90 transition-opacity mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
      <LocationModal
        isOpen={showLocationModal}
        mode="onboarding"
        onCaptured={(location) => {
          saveStoreLocation(location);
          finish();
        }}
        onSetupLater={finish}
      />
    </div>
  );
};

/**
 * Language preference, asked right after the shop's position.
 *
 * Applying the choice immediately — rather than on Continue — is deliberate: the
 * heading and the button below it change language under the shopkeeper's finger,
 * which is the clearest possible confirmation that the choice took effect.
 */
const LanguageStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full shadow-lg flex flex-col max-h-[80vh]">
      <h2 className="text-white text-2xl font-bold mb-1 text-center">{t('onboarding_language_title')}</h2>
      <p className="text-neutral-400 text-xs text-center mb-4">{t('onboarding_language_hint')}</p>

      <div className="space-y-2 overflow-y-auto hide-scrollbar flex-1">
        {LANGUAGES.map((option) => {
          const selected = language === option.code;
          return (
            <button
              key={option.code}
              type="button"
              onClick={() => setLanguage(option.code)}
              aria-pressed={selected}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${
                selected
                  ? 'border-[#E6E6FA] bg-[#E6E6FA]/10 text-white'
                  : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <span>
                <span className="block font-semibold text-base">{option.nativeName}</span>
                <span className="block text-xs text-neutral-500">{option.name}</span>
              </span>
              {selected && <span className="material-symbols-outlined text-[#E6E6FA]">check_circle</span>}
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-opacity-90 transition-opacity mt-4"
      >
        {t('onboarding_continue')}
      </button>
    </div>
  );
};

interface AiQuestion {
  type: 'select' | 'input';
  title: string;
  options?: string[];
  intent?: string;
  subtext?: string;
  multiSelect?: boolean;
}

/**
 * Keeps only the questions that can actually be rendered.
 *
 * The model is asked for a strict shape, and mostly gives one — but a single
 * malformed entry used to be enough to paint an empty card (no title, no
 * options) that the shopkeeper could not answer and could not skip.
 */
const parseQuestionnaire = (parsed: unknown): AiQuestion[] => {
  const raw = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(raw)) return [];

  const cleaned: AiQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const q = entry as Record<string, unknown>;
    const title = typeof q.title === 'string' ? q.title.trim() : '';
    if (!title) continue;

    const type: 'select' | 'input' = q.type === 'input' ? 'input' : 'select';
    const options = Array.isArray(q.options)
      ? q.options
          .map((option) => (typeof option === 'string' ? option.trim() : ''))
          .filter(Boolean)
          .slice(0, 5)
      : [];

    // A select question with nothing to select is unanswerable.
    if (type === 'select' && options.length === 0) continue;

    cleaned.push({
      type,
      title,
      options: type === 'select' ? options : undefined,
      intent: typeof q.intent === 'string' && q.intent.trim() ? q.intent.trim() : 'unknown',
      subtext: typeof q.subtext === 'string' && q.subtext.trim() ? q.subtext.trim() : undefined,
      multiSelect: Boolean(q.multiSelect),
    });
  }
  return cleaned;
};

const BusinessContextStep: React.FC<{ 
  details: { storeName: string; storeCategory: string };
  onComplete: (answers: any) => void;
}> = ({ details, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<any[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const [dynamicConfig, setDynamicConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { language, t } = useLanguage();

  React.useEffect(() => {
    let mounted = true;
    const fetchGeminiData = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const userName = sanitizeForPrompt(localStorage.getItem('dukan-profile-name') || 'the owner');
        const safeCategory = sanitizeForPrompt(details.storeCategory);
        const safeStoreName = sanitizeForPrompt(details.storeName);
        // The questions are asked in the language the shopkeeper just chose, in
        // words they already use. The previous prompt asked a model to be a "MBA
        // business consultant", which produced MBA vocabulary — the exact
        // opposite of what someone behind a counter needs.
        const prompt = `You write a short setup questionnaire for a small shop owner in India. You are not writing for a manager. You are writing for the person behind the counter, who knows their shop better than any consultant and does not want to read business English.

The shop: a '${safeCategory}' business called '${safeStoreName}'. The owner's name is '${userName}'.

LANGUAGE — the most important rule:
- ${languageInstruction(language)}
- Every question, every option and every sub-hint must be in ${languageName(language)}.
- The only field that stays in English is "intent" (a short lowercase code like "primary_challenge").

STYLE — write like a person talking, not like a form:
- One short sentence per question, about 12 words at most.
- Use the words the owner already says out loud. Never use business jargon.
- Never use these words or ideas: inventory turnover, SKU, churn, procurement, omnichannel, conversion funnel, margin optimisation, supply chain, customer acquisition, operational efficiency, leverage, utilise.
- Each option is 2 to 5 words and is a real, concrete choice.
- No smileys, no exclamation marks, no "Let's".

SHAPE:
- 4 to 7 questions.
- Most are "select"; 1 or 2 may be "input" (the owner types the answer).
- "options" only on "select", with 2 to 5 entries.

EXAMPLE OF THE STYLE (English, for illustration only — do not copy it, and do not answer in English):
  bad:  "What is your current inventory turnover challenge?"
  good: "Which items run out fastest?"

Return ONLY this JSON, with no markdown and no explanation:
{"questions":[{"type":"select","title":"string","options":["string"],"intent":"english_snake_case","subtext":"string","multiSelect":false}]}`;

        const response = await withGeminiFailover((client) =>
          client.models.generateContent({
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          })
        );

        clearTimeout(timeoutId);

        const text = response.text;
        if (text && mounted) {
          const parsed = JSON.parse(text);
          const questions = parseQuestionnaire(parsed);
          // A questionnaire too broken to ask (one question, or none with
          // options) is treated as no questionnaire at all, so the fallback set
          // appears instead of a blank card.
          if (questions.length >= 3) {
            setDynamicConfig(questions);
          } else {
            console.warn('[Onboarding] AI questionnaire rejected as incomplete', questions.length);
          }
        }
      } catch (e) {
        console.warn('OpenRouter AI failed, falling back to preset', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchGeminiData();
    return () => { mounted = false; };
  }, [details]);

  // [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable.
  // const isOtherCategory = details.storeCategory === 'Other' || details.storeCategory === 'Other Grocery' || details.storeCategory === 'category_other';

  const q1Options = (() => {
    switch (details.storeCategory) {
      case 'Grocery / Kirana':
      case 'Pharmacy':
        return ['Managing expired inventory', 'Tracking customer credit (Udhar)', 'Competing with quick commerce', 'Managing multiple suppliers'];
      case 'Salon':
        return ['Empty slots during weekdays', 'Managing staff schedules', 'Retaining loyal clients', 'No-shows on appointments'];
      case 'Restaurant':
      case 'Cafe':
        return ['Food wastage', 'Managing rush hours', 'High delivery commissions', 'Inconsistent food quality'];
      default:
        return ['Getting new customers', 'Managing cash flow', 'Hiring good staff', 'Tracking inventory'];
    }
  })();

  const getQuestionConfig = (index: number) => {
    if (dynamicConfig && Array.isArray(dynamicConfig) && index < dynamicConfig.length) {
      const q = dynamicConfig[index];
      // Ensure specific structure matches existing UI expectations
      return {
        title: q.title || `Question ${index + 1}`,
        subtext: q.subtext || (q.multiSelect ? t('onboarding_select_all') : undefined),
        type: q.type === 'input' ? 'input' : 'select',
        options: q.options || [],
        multiSelect: !!q.multiSelect,
        intent: q.intent || 'unknown',
        placeholder: q.type === 'input' ? t('onboarding_type_answer') : undefined
      };
    }

    // Offline floor for languages that ship their own fixed questions, so a
    // failed AI call does not drop a Hindi user back into English.
    const localized = localizedFallbackQuestions(language);
    if (localized) {
      const preset = localized[index];
      if (!preset) return null;
      return {
        ...preset,
        placeholder: preset.type === 'input' ? t('onboarding_type_answer') : undefined,
      };
    }

    // Fallback Preset Logic
    if (index === 0) {
      return {
        title: "1. What is your biggest challenge right now?",
        subtext: "(Select up to 2)",
        type: 'select',
        options: [...q1Options, "Other"],
        multiSelect: true,
        intent: 'primary_challenge'
      };
    }
    if (index === 1) {
      const q1Answers = answers[0] || [];
      const mainChallenge = q1Answers[0] || '';

      if (mainChallenge.includes('expired') || mainChallenge.includes('wastage') || mainChallenge.includes('inventory')) {
        return { title: "2. How do you track your waste/inventory?", type: 'select', options: ["Manual counts", "Basic POS", "No tracking yet", "Supplier handles it"], intent: 'inventory_tracking' };
      }
      if (mainChallenge.includes('credit') || mainChallenge.includes('cash flow') || mainChallenge.includes('Udhar')) {
        return { title: "2. How do you manage payments & credit?", type: 'select', options: ["Paper diary", "Accounting App", "Memory", "Cash only"], intent: 'credit_management' };
      }
      if (mainChallenge.includes('slots') || mainChallenge.includes('no-shows') || mainChallenge.includes('retention')) {
        return { title: "2. How do clients book your services?", type: 'select', options: ["Phone calls", "Walk-ins only", "WhatsApp", "Booking platform"], intent: 'booking_method' };
      }
      return { title: "2. How do you primarily serve customers?", type: 'select', options: ["Walk-in", "Appointment-based", "Online", "Mix"], intent: 'service_method' };
    }
    if (index === 2) {
      return {
        title: "3. What do you want to improve the most?",
        type: 'select',
        options: ['Increase sales', 'Reduce losses', 'Improve retention', 'Improve efficiency', 'Better financial visibility'],
        intent: 'primary_goal'
      };
    }
    // [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable.
    // if (index === 3 && isOtherCategory) {
    //    return {
    //      title: "4. Describe your business in one line",
    //      type: 'input',
    //      placeholder: "e.g. A boutique selling handmade jewelry",
    //      intent: 'business_description'
    //    };
    // }
    return null;
  };

  const currentQ = getQuestionConfig(stepIndex);
  // [MULTI-BUSINESS] grocery-only build: preset step count is 3 (the "Other" 4th step is disabled).
  // const totalSteps = dynamicConfig && Array.isArray(dynamicConfig) ? dynamicConfig.length : (isOtherCategory ? 4 : 3);
  const totalSteps = dynamicConfig && Array.isArray(dynamicConfig) ? dynamicConfig.length : 3;

  const handleToggle = (opt: string) => {
    // @ts-ignore
    if (currentQ?.multiSelect) {
      if (currentSelection.includes(opt)) {
        setCurrentSelection(currentSelection.filter(c => c !== opt));
      } else if (currentSelection.length < 2) {
        setCurrentSelection([...currentSelection, opt]);
      }
    } else {
      setCurrentSelection([opt]);
    }
  };

  // ─── Grocery item blocklist for schema validation ──────────────────────────
  // Any AI-returned item whose name matches one of these substrings is rejected.
  // This prevents Gemini's Kirana-biased training data from bleeding into
  // non-grocery "Other" businesses (e.g. Fish Shop showing Amul Milk).
  const GROCERY_BLOCKLIST = [
    'maggi', 'amul', 'parle', 'tata salt', 'noodles', 'atta', 'maida',
    'dal', 'chana', 'rice', 'chaval', 'oil', 'sunflower', 'mustard oil',
    'biscuit', 'namkeen', 'poha', 'suji', 'sooji', 'besan', 'sugar',
    'milk', 'ghee', 'butter', 'paneer', 'bread', 'eggs', 'aata',
  ];

  const isGroceryItem = (name: string): boolean => {
    const lower = name.toLowerCase();
    return GROCERY_BLOCKLIST.some(term => lower.includes(term));
  };

  const validateCatalogItem = (item: any): boolean => {
    if (!item || typeof item.name !== 'string' || item.name.trim().length === 0) return false;
    if (isGroceryItem(item.name)) return false;
    if (typeof item.price !== 'number' || item.price <= 0) return false;
    if (isNaN(parseInt(item.stock)) || parseInt(item.stock) <= 0) return false;
    return true;
  };

  /* ─── [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable ───
  // ─── Neutral fallback (spec-defined) ──────────────────────────────────────
  // Used when AI fails OR schema validation rejects the response.
  // Never uses grocery items. Never uses initialProducts.
  const NEUTRAL_FALLBACK = [
    { name: 'Item 1', price: 100, stock: 10, unit: 'pcs' },
    { name: 'Item 2', price: 150, stock: 10, unit: 'pcs' },
    { name: 'Item 3', price: 200, stock: 10, unit: 'pcs' },
    { name: 'Item 4', price: 250, stock: 10, unit: 'pcs' },
  ];

  const generateOtherCatalogSeed = async (bizContext: string) => {
    // Pre-write the neutral fallback immediately so ProductContext
    // always has something safe to read — even if this function throws.
    localStorage.setItem('dukaan-custom-catalog-seed', JSON.stringify(NEUTRAL_FALLBACK));

    const safeBizContext = sanitizeForPrompt(bizContext);

    try {
      // ── Hardened prompt with grocery blocklist + one-shot example ──────────
      // The example anchors Gemini to domain-specific items and away from its
      // Kirana-biased defaults. The FORBIDDEN list is a last-resort instruction
      // that fires even if the model ignores Rule 2.
      const prompt = `You are generating a starter product catalog for a small Indian business.

Business type: "${safeBizContext}"

RULES (follow all strictly):
1. Every item must be directly sold or offered by this specific business type.
2. FORBIDDEN: Maggi, Amul, Parle-G, atta, dal, rice, oil, milk, ghee, bread, biscuits, eggs, sugar, namkeen, poha. Do not include these under any circumstances.
3. Do NOT use generic names like "Product 1" or "Item A".
4. Return EXACTLY 5 items. No more, no less.
5. Prices in Indian Rupees (number only, no ₹ symbol).
6. Stock between 5 and 200.
7. Return ONLY valid JSON. No markdown. No explanation.

EXAMPLE — if business type is "Fish Shop":
{ "catalog": [
  { "name": "Rohu Fish", "price": 180, "stock": 30, "unit": "kg" },
  { "name": "Catla Fish", "price": 220, "stock": 20, "unit": "kg" },
  { "name": "Prawns (Medium)", "price": 350, "stock": 15, "unit": "kg" },
  { "name": "Salmon Fillet", "price": 600, "stock": 10, "unit": "kg" },
  { "name": "Fresh Tuna", "price": 450, "stock": 12, "unit": "kg" }
]}

Now generate for: "${safeBizContext}"

Return format:
{
  "catalog": [
    { "name": "string", "price": number, "stock": number, "unit": "pcs | kg | service" }
  ]
}`;

      const response = await withGeminiFailover((client) =>
        client.models.generateContent({
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        })
      );

      if (response.text) {
        let cleanText = response.text.trim();
        if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
        if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
        if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);

        const data = JSON.parse(cleanText);

        if (data && Array.isArray(data.catalog)) {
          // ── Schema validation: reject grocery-contaminated items ──────────
          const validItems = data.catalog.filter(validateCatalogItem);

          // Require at least 3 valid items — otherwise the whole response
          // is considered a hallucination and we fall through to the fallback.
          if (validItems.length >= 3) {
            const dynamicCatalog = validItems.map((item: any) => ({
              name: String(item.name).trim(),
              price: Number(item.price),
              stock: parseInt(String(item.stock)),
              unit: String(item.unit || 'pcs'),
            }));
            // Write validated seed and mark as AI-verified
            localStorage.setItem('dukaan-custom-catalog-seed', JSON.stringify(dynamicCatalog));
            localStorage.setItem('dukaan-other-ai-seed-done', 'true');
            return;
          }
          // Fewer than 3 valid items → fallback already written above, just return
          console.warn('[CatalogSeed] AI response failed schema validation — using neutral fallback');
          return;
        }
      }
    } catch (e) {
      console.warn('[CatalogSeed] Gemini call failed — using neutral fallback', e);
      // Neutral fallback was already pre-written at the top of this function
    }
  };
  ─── end [MULTI-BUSINESS] ─── */


  const handleNext = async () => {
    const finalSelection = currentQ?.type === 'input' 
       ? [customInput] 
       : currentSelection.includes('Other') && customInput.trim() 
           ? [...currentSelection.filter(c => c !== 'Other'), customInput]
           : currentSelection;
           
    if (finalSelection.length === 0) return;
    
    setIsTransitioning(true);
    
    const newAnswers = [...answers, finalSelection];
    if (stepIndex >= totalSteps - 1) {
      setIsLoading(true);
      
      const completeData = {
        businessContext: details,
        timestamp: new Date().toISOString(),
        qa: newAnswers.map((ans, i) => {
           const q = getQuestionConfig(i);
           return {
              question: q?.title,
              intent: q?.intent || 'preset_fallback',
              type: q?.type,
              answer: ans
           };
        })
      };
      localStorage.setItem('dukan-business-intelligence-context', JSON.stringify(completeData));

      // [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable.
      // if (isOtherCategory) {
      //   const contextStr = newAnswers[newAnswers.length - 1]?.[0] || details.storeName;
      //   await generateOtherCatalogSeed(contextStr);
      // }

      onComplete({
        answers: newAnswers,
        rawCategory: details.storeCategory
      });
    } else {
      setTimeout(() => {
        setAnswers(newAnswers);
        setCurrentSelection([]);
        setCustomInput('');
        setIsOptionsExpanded(false);
        setStepIndex(stepIndex + 1);
        setIsTransitioning(false);
      }, 500);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full shadow-lg flex flex-col h-[65vh] max-h-[550px] overflow-hidden justify-center items-center">
         <div className="animate-pulse flex flex-col items-center">
           <div className="w-8 h-8 rounded-full border-2 border-neutral-600 border-t-[#E6E6FA] animate-spin mb-6" />
           <p className="text-neutral-400 text-sm font-medium">Personalizing your experience...</p>
         </div>
      </div>
    );
  }

  if (!currentQ) return null;

  const canContinue = currentQ.type === 'input' ? customInput.trim().length > 0 : currentSelection.length > 0;

  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full shadow-lg flex flex-col h-[65vh] max-h-[550px] overflow-hidden">
      <style>{`
        @keyframes dust-out {
          0% { opacity: 1; filter: blur(0px); transform: scale(1) translateY(0); }
          100% { opacity: 0; filter: blur(8px); transform: scale(0.95) translateY(-10px); }
        }
        @keyframes dust-in {
          0% { opacity: 0; filter: blur(8px); transform: scale(1.05) translateY(10px); }
          100% { opacity: 1; filter: blur(0px); transform: scale(1) translateY(0); }
        }
        .dust-exit { animation: dust-out 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .dust-enter { animation: dust-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
      `}</style>
      <div className="text-center mb-6 shrink-0 z-10">
        <h2 className="text-white text-2xl font-bold mb-2">{t('onboarding_questions_title')}</h2>
      </div>

      <div className="flex-1 relative">
        <div className={`absolute inset-0 flex flex-col ${isTransitioning ? 'dust-exit' : 'dust-enter'}`}>
          <label className="text-white font-bold block mb-4 text-xl leading-tight">
            {currentQ.title} 
            {currentQ.subtext && <span className="text-neutral-500 font-normal text-sm font-sans block mt-1">{currentQ.subtext}</span>}
          </label>
          
          <div className="space-y-3 overflow-y-auto hide-scrollbar pb-4 flex-1">
            {currentQ.type === 'select' && currentQ.options?.slice(0, 3).map(opt => (
               <button
                 key={opt}
                 onClick={() => handleToggle(opt)}
                 // @ts-ignore
                 className={`w-full text-left px-4 py-4 rounded-xl border text-base transition-colors ${
                   currentSelection.includes(opt) 
                     ? 'border-[#E6E6FA] bg-[#E6E6FA]/10 text-white shadow-[0_0_15px_rgba(230,230,250,0.15)]' 
                     : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
                 } ${currentQ.multiSelect && currentSelection.length >= 2 && !currentSelection.includes(opt) ? 'opacity-50 cursor-not-allowed' : ''}`}
                 // @ts-ignore
                 disabled={currentQ.multiSelect && currentSelection.length >= 2 && !currentSelection.includes(opt)}
               >
                 {opt}
               </button>
            ))}

            {currentQ.type === 'select' && (currentQ.options?.length || 0) > 3 && (
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  isOptionsExpanded ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0 pointer-events-none'
                }`}
              >
                <div className="space-y-3 pb-1">
                  {currentQ.options?.slice(3).map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleToggle(opt)}
                      // @ts-ignore
                      className={`w-full text-left px-4 py-4 rounded-xl border text-base transition-colors ${
                        currentSelection.includes(opt) 
                          ? 'border-[#E6E6FA] bg-[#E6E6FA]/10 text-white shadow-[0_0_15px_rgba(230,230,250,0.15)]' 
                          : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
                      } ${currentQ.multiSelect && currentSelection.length >= 2 && !currentSelection.includes(opt) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      // @ts-ignore
                      disabled={currentQ.multiSelect && currentSelection.length >= 2 && !currentSelection.includes(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentQ.type === 'select' && (currentQ.options?.length || 0) > 3 && (
              <button
                onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}
                className="w-full text-center text-sm text-neutral-500 mt-2 hover:text-neutral-300 transition-colors font-medium py-2"
              >
                {isOptionsExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
            
            {/* Show inline input if 'Other' is selected in a multi/single select */}
            {currentQ.type === 'select' && currentSelection.includes('Other') && (
              <div className="pt-2 animate-dust-in">
                 <input
                   autoFocus
                   className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3.5 text-white text-base focus:outline-none focus:border-[#E6E6FA] transition-colors placeholder-neutral-500"
                   placeholder="Please specify..."
                   type="text"
                   value={customInput}
                   onChange={(e) => setCustomInput(e.target.value)}
                 />
              </div>
            )}

            {/* Show purely input if it's an input question */}
            {currentQ.type === 'input' && (
              <div className="pt-2">
                 <input
                   autoFocus
                   className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3.5 text-white text-base focus:outline-none focus:border-[#E6E6FA] transition-colors placeholder-neutral-500"
                   placeholder={currentQ.placeholder}
                   type="text"
                   value={customInput}
                   onChange={(e) => setCustomInput(e.target.value)}
                 />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 pt-4 mt-2 border-t border-neutral-800 z-10 bg-[#1A1A1A]">
        <button
          onClick={handleNext}
          disabled={!canContinue || isTransitioning}
          className="w-full bg-[#E6E6FA] text-black font-semibold py-3.5 rounded-full text-lg hover:bg-opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('onboarding_continue')}
        </button>
      </div>
    </div>
  );
};


const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [step, setStep] = useState<'name' | 'storeDetails' | 'language' | 'businessContext'>('name');
  const [storeDetails, setStoreDetails] = useState<{storeName: string, storeCategory: string} | null>(null);

  const handleNameNext = (name: string) => {
    localStorage.setItem('dukan-profile-name', name);
    setStep('storeDetails');
  };

  const handleStoreDetailsNext = (details: { storeName: string; storeCategory: string }) => {
    localStorage.setItem('dukan-store-name', details.storeName);
    localStorage.setItem('dukan-store-category', details.storeCategory);
    setStoreDetails(details);
    // Language comes straight after the position, so the questionnaire that
    // follows is written in the language that was just picked.
    setStep('language');
  };

  const handleContextComplete = (answers: any) => {
    localStorage.setItem('dukan-store-context', JSON.stringify(answers));
    localStorage.setItem('dukan-onboarding-complete', 'true');
    
    // Non-blocking Firestore sync (safe, additive only)
    if (storeDetails) {
        const profileData = {
            storeDetails,
            answers,
            // Mirrored so "Welcome back, <name>!" still works on another device.
            ownerName: localStorage.getItem('dukan-profile-name') || undefined,
            timestamp: new Date().toISOString()
        };
        // The dynamic AI-generated Q&A (question/intent/type/answer) is the
        // point of the adaptive onboarding — persist it rather than letting it
        // die in localStorage.
        let onboarding: any = undefined;
        try {
          const raw = localStorage.getItem('dukan-business-intelligence-context');
          if (raw) onboarding = JSON.parse(raw);
        } catch (e) {
          console.warn('[Onboarding] Could not read business intelligence context', e);
        }
        saveBusinessProfileToCloud(storeDetails.storeName, profileData, undefined, onboarding);
    }

    onComplete();
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        {step === 'name' && <NameStep onNext={handleNameNext} />}
        {step === 'storeDetails' && <StoreDetailsStep onNext={handleStoreDetailsNext} />}
        {step === 'language' && <LanguageStep onNext={() => setStep('businessContext')} />}
        {step === 'businessContext' && storeDetails && <BusinessContextStep details={storeDetails} onComplete={handleContextComplete} />}
    </div>
  );
};

export default OnboardingFlow;