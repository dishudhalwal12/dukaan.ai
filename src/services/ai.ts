
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

  // One compact line per item instead of a JSON array. The model has to read
  // its way to the first token, so every field name and brace removed here is
  // latency removed from the first insight.
  const inventoryLines = simplifiedProducts
    .map((item) => `${item.name} | ₹${item.price} | ${item.stock} left`)
    .join('\n');

  const insightLanguage = languageName(language);
  
  const category = localStorage.getItem('dukan-store-category') || 'retail';
  const rawContext = localStorage.getItem('dukan-business-intelligence-context');
  let storeContextStr = '';
  if (rawContext) {
    try {
       const parsed = JSON.parse(rawContext);
       const compact = JSON.stringify(parsed.qa || parsed);
       storeContextStr = `Store context: ${compact.slice(0, 500)}`;
    } catch(e) {}
  }
  
  const systemInstruction = `You are a business advisor for a small ${category} shop in India. Write five short insights about the inventory below. ${storeContextStr}

OUTPUT CONTRACT (MANDATORY):
* Start your reply with "{" immediately. No preamble, no reasoning, no markdown, no code fence.
* Write exactly five minified JSON objects, one object per line, not an array, no blank lines.
* Every object has exactly: "icon", "title", "description".
* "icon" must be one of: warning, lightbulb, local_fire_department, trending_up, inventory, sell, groups.
* "title" is at most 6 words.
* "description" is 15 to 20 words: punchy, direct, actionable. No background explanation.
* "title" and "description" must be in ${insightLanguage}. ${languageInstruction(language)}

INSIGHT RULES:
* At least one insight is a low-stock alert when an item has 10 or fewer left.
* Mix restocking, combos, seasonal demand, and customer engagement, all specific to ${category}.
* Never repeat an insight and never invent an item or price that is not in the inventory.`;

  let yieldedCount = 0;

  try {
    const responseStream = await withGeminiStreamFailover((client) =>
      client.models.generateContentStream({
        contents: `INVENTORY\n${inventoryLines}\n\nWrite the five JSON objects now, starting with "{".`,
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

    // No synthetic insight here. A model that returned nothing usable is an
    // outage, and hiding it behind a guessed "stock looks healthy" card told the
    // shopkeeper everything was fine when the AI had failed.
    if (yieldedCount === 0) {
      throw new Error('The AI returned no usable insights.');
    }

  } catch (error) {
    console.error("Error generating AI insights:", error);
    const detail = String((error as { message?: string })?.message || error || 'unknown error')
      .replace(/\s+/g, ' ')
      .slice(0, 160);

    // Only show the error card if no insights at all were successfully yielded
    if (yieldedCount === 0) {
      const errorString = JSON.stringify(error);
      let title = translate('insights_error_title');
      let description = `${translate('insights_error_description')} (${detail})`;

      if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
        title = translate('insights_quota_title');
        description = `${translate('insights_quota_description')} (${detail})`;
      }
      
      yield { icon: 'error', title, description };
    }
  }
};