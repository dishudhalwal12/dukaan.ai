
import { Product, Insight } from '../types.ts';
import { withGeminiStreamFailover } from '../utils/geminiClient.ts';

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

export async function* generateDynamicInsights(products: Product[], language: string): AsyncGenerator<Insight> {
  if (!products || products.length === 0) {
    yield { icon: 'add_shopping_cart', title: 'Add Your First Product', description: 'Add products to your catalog to start getting AI insights.' };
    return;
  }

  const simplifiedProducts = products.map(({ name, stock, price }) => ({ name, stock, price }));
  
  let languageName: string;
  switch (language) {
    case 'hi':
      languageName = 'Hindi';
      break;
    case 'ur':
      languageName = 'Urdu';
      break;
    case 'ta':
      languageName = 'Tamil';
      break;
    case 'pa':
      languageName = 'Punjabi';
      break;
    case 'gu':
      languageName = 'Gujarati';
      break;
    case 'kn':
      languageName = 'Kannada';
      break;
    default:
      languageName = 'English';
      break;
  }
  
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
* The text for "title" and "description" MUST be in the ${languageName} language.
* For the "icon" key, you MUST use one of these Material Symbols Outlined names: 'warning', 'lightbulb', 'local_fire_department', 'trending_up', 'inventory', 'sell', 'groups'.
* CRITICAL LENGTH RULE: Each "description" MUST be strictly under 3 lines (maximum 15 to 20 words). Keep it punchy, direct, and actionable. Avoid long background explanations or wordy sentences.

**INSIGHT GUIDELINES:**
Generate a mix of insights tailored specifically for a ${category} business. At least one should be a low-stock alert if any item is running low (e.g. <=10). Think about combo deals, seasonal trends in India, service forecasts, or client engagement tips relevant to ${category}. Every insight must be crisp and under 3 lines.`;

  let yieldedCount = 0;

  try {
    const activeModel = (typeof process !== 'undefined' && process.env?.OPENROUTER_MODEL) || "liquid/lfm-2.5-2.6b:free";
    const responseStream = await withGeminiStreamFailover((client) =>
      client.models.generateContentStream({
        model: activeModel,
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
          title: `${lowStockItem.name} Low Stock`,
          description: `Only ${lowStockItem.stock} units remaining. Place restock order soon.`
        };
      } else {
        yield {
          icon: 'inventory',
          title: 'Healthy Inventory',
          description: `All ${simplifiedProducts.length} items are well-stocked. Ready for daily store sales.`
        };
      }
    }

  } catch (error) {
    console.error("Error generating AI insights:", error);
    
    // Only show the error card if no insights at all were successfully yielded
    if (yieldedCount === 0) {
      const errorString = JSON.stringify(error);
      let title = 'Could Not Fetch Insights';
      let description = 'There was an issue connecting to the AI service. Please try again later.';

      if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
        title = 'AI Quota Exceeded';
        description = 'You have used your daily AI insights quota. Please check your plan to upgrade.';
      }
      
      yield { icon: 'error', title, description };
    }
  }
};