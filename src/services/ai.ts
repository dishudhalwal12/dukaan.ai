
import { Product, Insight } from '../types.ts';
import { withGeminiStreamFailover } from '../utils/geminiClient.ts';
import { languageInstruction, languageName } from '../utils/languageName.ts';

// Callers that do not supply a translator still need human text, not raw keys.
const ENGLISH_FALLBACKS: Record<string, string> = {
  insights_empty_title: 'Add your first product',
  insights_empty_description: 'Add a few items to your store and I will start spotting trends, low stock and selling opportunities for you.',
  insights_low_stock_title: '{product} is running low',
  insights_low_stock_description: 'Only {count} left. Restock soon so you do not miss sales.',
  insights_healthy_title: 'Stock levels look healthy',
  insights_healthy_description: 'All {count} products are above the low-stock threshold. Focus on promoting your best sellers.',
  insights_error_title: 'Could not load insights',
  insights_error_description: 'Check your connection and try refreshing in a moment.',
  insights_quota_title: 'Daily insight limit reached',
  insights_quota_description: 'The AI has hit its limit for now. Your insights will return shortly.',
};

const ALLOWED_ICONS = new Set([
  'warning', 'lightbulb', 'local_fire_department', 'trending_up',
  'inventory', 'sell', 'groups', 'add_shopping_cart', 'error',
]);

function isValidInsight(value: unknown): value is Insight {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.icon === 'string' &&
    typeof v.title === 'string' && v.title.length > 0 && v.title.length <= 200 &&
    typeof v.description === 'string' && v.description.length > 0 && v.description.length <= 600
  );
}

function sanitizeInsight(raw: Insight): Insight {
  return {
    icon: ALLOWED_ICONS.has(raw.icon) ? raw.icon : 'lightbulb',
    title: raw.title.slice(0, 200),
    description: raw.description.slice(0, 600),
  };
}
function extractNextJsonObject(text: string): { parsed: unknown; nextIndex: number } | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const objStr = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(objStr);
            return { parsed, nextIndex: i + 1 };
          } catch {
            start = -1;
          }
        }
      }
    }
  }
  return null;
}

/**
 * @param translate Turns an internal product-name key (`product_maggi`) into the
 *   name the shopkeeper actually sees (`मैगी नूडल्स`). Without it the model is
 *   handed internal keys and can echo them back inside the advice.
 */
export async function* generateDynamicInsights(
  products: Product[],
  language: string,
  translate: (key: string, options?: { [key: string]: string | number }) => string = (key, options) => {
    const template = ENGLISH_FALLBACKS[key] ?? key;
    return options
      ? template.replace(/\{(\w+)\}/g, (match, name) => (name in options ? String(options[name]) : match))
      : template;
  },
): AsyncGenerator<Insight> {
  if (!products || products.length === 0) {
    yield {
      icon: 'add_shopping_cart',
      title: translate('insights_empty_title'),
      description: translate('insights_empty_description'),
    };
    return;
  }

  const simplifiedProducts = products.map(({ name, stock, price }) => ({
    // The display name, so the model reasons about "Maggi Noodles" rather than
    // about the translation key that happens to stand for it.
    name: translate(name) || name,
    stock,
    price,
  }));

  const insightLanguage = languageName(language);
  
  const category = localStorage.getItem('dukan-store-category') || 'retail';
  const rawContext = localStorage.getItem('dukan-business-intelligence-context');
  let storeContextStr = '';
  if (rawContext) {
    try {
       const parsed = JSON.parse(rawContext);
       storeContextStr = `Store Context: ${JSON.stringify(parsed.qa || parsed)}`;
    } catch(e) {}
  }
  
  const systemInstruction = `You are an expert AI business advisor for a small ${category} business owner in India. Your task is to generate five creative, actionable, and ultra-concise insights based on their inventory. The owner needs quick, easily digestible advice. ${storeContextStr}

**RESPONSE FORMAT RULES (MANDATORY):**
* You MUST provide EXACTLY FIVE insights.
* Output valid JSON objects. Each JSON object must have three keys: "icon", "title", and "description".
* The text for "title" and "description" MUST be in the ${insightLanguage} language. ${languageInstruction(language)}
* For the "icon" key, you MUST use one of these Material Symbols Outlined names: 'warning', 'lightbulb', 'local_fire_department', 'trending_up', 'inventory', 'sell', 'groups'.
* CRITICAL LENGTH RULE: Each "description" MUST be strictly under 3 lines (maximum 15 to 20 words). Keep it punchy, direct, and actionable. Avoid long background explanations or wordy sentences.

**INSIGHT GUIDELINES:**
Generate a mix of insights tailored specifically for a ${category} business. At least one should be a low-stock alert if any item is running low (e.g. <=10). Think about combo deals, seasonal trends in India, service forecasts, or client engagement tips relevant to ${category}. Every insight must be crisp and under 3 lines.`;

  let yieldedCount = 0;

  try {
    const responseStream = await withGeminiStreamFailover((client) =>
      client.models.generateContentStream({
        contents: `Here is the current inventory data: ${JSON.stringify(simplifiedProducts)}. Generate 5 punchy insights. Remember: keep every description strictly under 3 lines (max 20 words).`,
        config: {
          systemInstruction
        },
      })
    );

    let buffer = '';

    for await (const chunk of responseStream) {
      buffer += chunk.text;
      while (true) {
        const match = extractNextJsonObject(buffer);
        if (!match) break;
        buffer = buffer.substring(match.nextIndex);
        if (isValidInsight(match.parsed)) {
          yield sanitizeInsight(match.parsed);
          yieldedCount++;
        }
      }
    }

    // Process any remaining complete insight in the buffer
    while (true) {
      const match = extractNextJsonObject(buffer);
      if (!match) break;
      buffer = buffer.substring(match.nextIndex);
      if (isValidInsight(match.parsed)) {
        yield sanitizeInsight(match.parsed);
        yieldedCount++;
      }
    }

    // If stream ended but 0 valid insights were generated, provide smart inventory insight
    if (yieldedCount === 0) {
      const lowStockItem = simplifiedProducts.find(p => p.stock <= 10);
      if (lowStockItem) {
        yield {
          icon: 'warning',
          title: translate('insights_low_stock_title', { product: lowStockItem.name }),
          description: translate('insights_low_stock_description', { count: lowStockItem.stock }),
        };
      } else {
        yield {
          icon: 'inventory',
          title: translate('insights_healthy_title'),
          description: translate('insights_healthy_description', { count: simplifiedProducts.length }),
        };
      }
    }

  } catch (error) {
    console.error("Error generating AI insights:", error);
    
    // Only show the error card if no insights at all were successfully yielded
    if (yieldedCount === 0) {
      const errorString = JSON.stringify(error);
      let title = translate('insights_error_title');
      let description = translate('insights_error_description');

      if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
        title = translate('insights_quota_title');
        description = translate('insights_quota_description');
      }
      
      yield { icon: 'error', title, description };
    }
  }
};