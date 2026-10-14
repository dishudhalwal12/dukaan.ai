import { GoogleGenAI } from "@google/genai";

// ─── Key Resolution ───────────────────────────────────────────────────────────
const resolveKeys = (): [string, string | null] => {
  let primary = 'dummy_key';
  let secondary: string | null = null;
  try {
    // @ts-ignore
    if (import.meta.env?.VITE_GEMINI_API_KEY) {
      // @ts-ignore
      primary = import.meta.env.VITE_GEMINI_API_KEY;
    }
    // @ts-ignore
    if (import.meta.env?.VITE_GEMINI_API_KEY_2) {
      // @ts-ignore
      secondary = import.meta.env.VITE_GEMINI_API_KEY_2;
    }
  } catch {
    // Ignore env access errors - will use dummy key
  }
  return [primary, secondary];
};

const [PRIMARY_KEY, SECONDARY_KEY] = resolveKeys();

// ─── Error Classification ─────────────────────────────────────────────────────
const isSwitchableError = (error: unknown): boolean => {
  const msg = JSON.stringify(error) + String(error);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('403') ||
    msg.includes('invalid') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('quota')
  );
};

// ─── Client Factory ───────────────────────────────────────────────────────────
export const createGeminiClient = (key: string): GoogleGenAI =>
  new GoogleGenAI({ apiKey: key });

// ─── Primary & Fallback Clients ───────────────────────────────────────────────
export const primaryClient = createGeminiClient(PRIMARY_KEY);
export const secondaryClient = SECONDARY_KEY
  ? createGeminiClient(SECONDARY_KEY)
  : null;

// ─── Failover Wrapper ─────────────────────────────────────────────────────────
/**
 * Executes a Gemini API call with automatic failover to the secondary key.
 *
 * @param fn - A function that receives a GoogleGenAI client and returns a Promise<T>
 * @returns The result of the API call, or throws if both keys fail
 */
export async function withGeminiFailover<T>(
  fn: (client: GoogleGenAI) => Promise<T>
): Promise<T> {
  try {
    return await fn(primaryClient);
  } catch (primaryError) {
    if (secondaryClient && isSwitchableError(primaryError)) {
      try {
        return await fn(secondaryClient);
      } catch (secondaryError) {
        // Both keys failed – re-throw the secondary error
        throw secondaryError;
      }
    }
    throw primaryError;
  }
}

/**
 * Executes a Gemini streaming call with automatic failover to the secondary key.
 * Returns an async iterable of stream chunks from whichever key succeeds.
 */
export async function withGeminiStreamFailover<T>(
  fn: (client: GoogleGenAI) => Promise<AsyncIterable<T>>
): Promise<AsyncIterable<T>> {
  try {
    return await fn(primaryClient);
  } catch (primaryError) {
    if (secondaryClient && isSwitchableError(primaryError)) {
      try {
        return await fn(secondaryClient);
      } catch (secondaryError) {
        throw secondaryError;
      }
    }
    throw primaryError;
  }
}
