
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
  
  const systemInstruction = `You are an expert AI business advisor for a small ${category} business owner in India. Your task is to generate five creative, actionable, and concise insights based on their inventory. The owner relies on simple advice. ${storeContextStr}

**RESPONSE FORMAT RULES (MANDATORY):**
*   You MUST provide EXACTLY FIVE insights.
*   Each insight MUST be a single, valid JSON object on its own line. Use newline characters ('\\n') to separate them.
*   DO NOT use markdown (like \`\`\`json), and DO NOT wrap the list in a JSON array \`[]\`.
*   Each JSON object must have three keys: "icon", "title", and "description".
*   The text for "title" and "description" MUST be in the ${languageName} language.

**ICON SELECTION:**
For the "icon" key, you MUST use one of these Material Symbols Outlined names: 'warning', 'lightbulb', 'local_fire_department', 'trending_up', 'inventory', 'sell', 'groups'. Choose the most relevant icon for each insight.

**INSIGHT GUIDELINES:**
Generate a mix of insights tailored specifically for a ${category} business. At least one should be a low-stock/low-availability alert if any item is running low (e.g. <=10). Think about combo deals, seasonal trends in India, service forecasts, or client engagement tips relevant to ${category}. Your advice MUST be practical.`;

  try {
    const responseStream = await withGeminiStreamFailover((client) =>
      client.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: `Here is the current inventory data: ${JSON.stringify(simplifiedProducts)}. Please generate 5 insights based on this data.`,
        config: {
          systemInstruction
        },
      })
    );

    let buffer = '';
    for await (const chunk of responseStream) {
        buffer += chunk.text;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, newlineIndex).trim();
            buffer = buffer.substring(newlineIndex + 1);
            if (line) {
                try {
                    const parsed = JSON.parse(line);
                    if (isValidInsight(parsed)) {
                        yield sanitizeInsight(parsed);
                    } else {
                        console.warn("Insight failed schema validation:", line);
                    }
                } catch (e) {
                    console.warn("Could not parse insight from stream:", line, e);
                }
            }
        }
    }
    // Process any remaining part of the buffer
    if (buffer.trim()) {
        try {
            const parsed = JSON.parse(buffer.trim());
            if (isValidInsight(parsed)) {
                yield sanitizeInsight(parsed);
            } else {
                console.warn("Final insight failed schema validation:", buffer.trim());
            }
        } catch (e) {
            console.warn("Could not parse final insight from stream:", buffer.trim(), e);
        }
    }

  } catch (error) {
    console.error("Error generating AI insights:", error);
    
    const errorString = JSON.stringify(error);
    let title = 'Could Not Fetch Insights';
    let description = 'There was an issue connecting to the AI service. Please try again later.';

    if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
      title = 'AI Quota Exceeded';
      description = 'You have used your daily AI insights quota. Please check your plan to upgrade.';
    }
    
    yield { icon: 'error', title, description };
  }
};