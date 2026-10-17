// OpenRouter Client for Dukaan.AI 2.0
// Uses openrouter/free model with automatic fallback and failover

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

export interface GenerateContentOptions {
  model?: string;
  contents?: any;
  prompt?: string;
  systemInstruction?: string;
  messages?: OpenRouterMessage[];
  config?: {
    systemInstruction?: string;
    responseMimeType?: string;
  };
  timeoutMs?: number;
}

export interface StreamChunk {
  text: string;
}

export const PRIMARY_OPENROUTER_KEY = '';
export const BACKUP_OPENROUTER_KEY = '';

const EXPIRED_KEYS = new Set([
  '',
  ''
]);

// ─── Key & Model Resolution ──────────────────────────────────────────────────
export const resolveOpenRouterKeys = (): string[] => {
  const keys: string[] = [];
  try {
    // 1. Vite environment variable
    // @ts-ignore
    if (import.meta.env?.VITE_OPENROUTER_API_KEY) {
      // @ts-ignore
      keys.push(import.meta.env.VITE_OPENROUTER_API_KEY);
    }
    // 2. Process env injected via Vite define
    if (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY) {
      keys.push(process.env.OPENROUTER_API_KEY);
    }
    // 3. Local storage override
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('dukan-openrouter-api-key');
      if (stored) keys.push(stored);
    }
  } catch {
    // ignore access error
  }
  keys.push(PRIMARY_OPENROUTER_KEY);
  keys.push(BACKUP_OPENROUTER_KEY);

  // Return unique non-empty keys, strictly filtering out known expired keys
  return Array.from(new Set(keys.filter(k => k && !EXPIRED_KEYS.has(k))));
};

export const OPENROUTER_API_KEY = resolveOpenRouterKeys()[0] || PRIMARY_OPENROUTER_KEY;
export const DEFAULT_MODEL = 'liquid/lfm-2.5-2.6b:free';
export const FREE_MODELS_POOL = [
  'liquid/lfm-2.5-2.6b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'cohere/north-mini-code:free'
];

/**
 * Strips reasoning tokens (<think>...</think>) and markdown wrappers from model response.
 */
export function cleanModelOutput(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Converts generic / Gemini-style contents and configs into OpenRouter messages.
 */
function buildMessages(options: GenerateContentOptions): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [];

  const sys = options.systemInstruction || options.config?.systemInstruction;
  if (sys) {
    messages.push({ role: 'system', content: sys });
  }

  if (options.messages && options.messages.length > 0) {
    messages.push(...options.messages);
    return messages;
  }

  const rawContents = options.contents || options.prompt;

  if (typeof rawContents === 'string') {
    messages.push({ role: 'user', content: rawContents });
    return messages;
  }

  if (Array.isArray(rawContents)) {
    const parts: any[] = [];
    for (const item of rawContents) {
      if (typeof item === 'string') {
        parts.push({ type: 'text', text: item });
      } else if (item?.inlineData) {
        const mime = item.inlineData.mimeType || 'image/jpeg';
        const base64 = item.inlineData.data;
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${base64}` }
        });
      }
    }
    messages.push({ role: 'user', content: parts.length > 0 ? parts : String(rawContents) });
    return messages;
  }

  if (rawContents) {
    messages.push({ role: 'user', content: String(rawContents) });
  }

  return messages;
}

/**
 * Calls AI completions API with OpenRouter free model as PRIMARY,
 * falling back to Local Edge SLM if OpenRouter is unreachable or keys fail.
 */
export async function callOpenRouter(options: GenerateContentOptions): Promise<{ text: string }> {
  const messages = buildMessages(options);
  const keys = resolveOpenRouterKeys();
  let lastError: any = null;
  const targetModel = options.model || DEFAULT_MODEL;
  const modelsList = Array.from(new Set([targetModel, ...FREE_MODELS_POOL])).slice(0, 3);

  // 1. PRIMARY: Call OpenRouter Free Model Pool
  if (keys.length > 0) {
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs || 25000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
            'X-Title': 'Dukaan.AI 2.0'
          },
          body: JSON.stringify({
            model: targetModel,
            models: modelsList,
            messages
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 401 || response.status === 403 || errText.includes('expired') || errText.includes('invalid')) {
            console.warn(`OpenRouter key #${i + 1} rejected (${response.status}: ${errText.slice(0, 100)}), trying next key...`);
            lastError = new Error(`OpenRouter key error (${response.status}): ${errText}`);
            continue;
          }
          throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        const cleaned = cleanModelOutput(rawContent);

        return { text: cleaned };
      } catch (err) {
        lastError = err;
        if (i < keys.length - 1 && (String(err).includes('401') || String(err).includes('expired') || String(err).includes('key'))) {
          continue;
        }
        console.warn(`[OpenRouter Primary Failed]: ${err.message || err}. Falling back to Local SLM...`);
        break; // break to local SLM fallback
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  // 2. FALLBACK: Attempt Local Edge SLM — only when one is actually configured.
  // There is deliberately no default URL. A hardcoded 127.0.0.1:8080 made every
  // browser with no local model dial its OWN loopback, hang for the full 10s
  // timeout and then throw; Vite also baked that literal into the bundle.
  const localUrl =
    (typeof process !== 'undefined' && process.env?.LLM_BASE_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_LLM_BASE_URL) ||
    '';

  if (localUrl) {
    const localModel = (typeof process !== 'undefined' && process.env?.LLM_MODEL_NAME) || 
                       'models/dukaan-qwen-1.5b-fused-4bit';

    const localCtrl = new AbortController();
    const localTimer = setTimeout(() => localCtrl.abort(), 10000);
    try {
      const localRes = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages
        }),
        signal: localCtrl.signal
      });

      if (localRes.ok) {
        const data = await localRes.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        if (rawContent) {
          return { text: cleanModelOutput(rawContent) };
        }
      }
    } catch (localErr: any) {
      console.warn(`[Local SLM Fallback Failed]: ${localErr?.message || localErr}`);
    } finally {
      // Also on the error path: a leaked timer kept the process alive 10s and
      // aborted an already-settled request.
      clearTimeout(localTimer);
    }
  }

  throw lastError || new Error('All OpenRouter keys and Local SLM fallback failed');
}

/**
 * Streams chat completions from OpenRouter SSE using openrouter/free.
 * Automatically tries primary and fallback keys on auth/quota errors.
 */
export async function* streamOpenRouter(options: GenerateContentOptions): AsyncGenerator<StreamChunk> {
  const messages = buildMessages(options);
  const keys = resolveOpenRouterKeys();
  let streamResponse: Response | null = null;

  const targetModel = options.model || DEFAULT_MODEL;
  const modelsList = Array.from(new Set([targetModel, ...FREE_MODELS_POOL])).slice(0, 3);

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 45000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          'X-Title': 'Dukaan.AI 2.0'
        },
        body: JSON.stringify({
          model: targetModel,
          models: modelsList,
          stream: true,
          messages
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 401 || response.status === 403 || errText.includes('expired') || errText.includes('invalid')) {
          console.warn(`OpenRouter key #${i + 1} rejected in stream (${response.status}), trying fallback...`);
          clearTimeout(timeoutId);
          continue;
        }
        clearTimeout(timeoutId);
        throw new Error(`OpenRouter Stream error (${response.status}): ${errText}`);
      }

      // Clear connection timeout immediately so streaming reader is not aborted
      clearTimeout(timeoutId);
      streamResponse = response;
      break;
    } catch (err) {
      clearTimeout(timeoutId);
      if (i < keys.length - 1) continue;
      throw err;
    }
  }

  if (!streamResponse || !streamResponse.body) {
    throw new Error('OpenRouter streaming failed across all available keys');
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        if (trimmed === 'data: [DONE]') return;

        const payloadStr = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(payloadStr);
          const delta = parsed.choices?.[0]?.delta;
          const textChunk = delta?.content;
          if (textChunk) {
            yield { text: textChunk };
          }
        } catch {
          // Ignore SSE chunk parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Drop-in Compatibility Client ─────────────────────────────────────────────
export class OpenRouterClient {
  public models = {
    generateContent: async (options: GenerateContentOptions) => {
      return callOpenRouter(options);
    },
    generateContentStream: async (options: GenerateContentOptions) => {
      return streamOpenRouter(options);
    }
  };
}

export const defaultOpenRouterClient = new OpenRouterClient();

export async function withOpenRouterFailover<T>(
  fn: (client: OpenRouterClient) => Promise<T>
): Promise<T> {
  return await fn(defaultOpenRouterClient);
}

export async function withOpenRouterStreamFailover<T>(
  fn: (client: OpenRouterClient) => Promise<AsyncIterable<T>>
): Promise<AsyncIterable<T>> {
  return await fn(defaultOpenRouterClient);
}

// Aliases for seamless drop-in backwards compatibility
export const withGeminiFailover = withOpenRouterFailover;
export const withGeminiStreamFailover = withOpenRouterStreamFailover;
export const primaryClient = defaultOpenRouterClient;
export const secondaryClient = defaultOpenRouterClient;
export const createGeminiClient = () => defaultOpenRouterClient;
