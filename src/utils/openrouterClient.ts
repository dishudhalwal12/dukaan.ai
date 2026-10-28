// OpenRouter Client for Nukkad 2.0
// Uses openrouter/free model with automatic fallback and failover

import { apiUrl, authHeaders } from '../services/apiSession.ts';

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

/**
 * Every model call goes through the bot, which holds the provider key. The key
 * is deliberately NOT shipped to the browser: this module used to read it from
 * `import.meta.env` / an injected `process.env`, which put the live OpenRouter
 * key in the public bundle. All the client holds now is the shopkeeper's
 * Supabase token.
 */
export const AI_CHAT_ENDPOINT = '/api/ai/chat/completions';

// There is deliberately no model list here. The model is an operational choice
// (`OPENROUTER_MODEL`) that the bot makes server-side, so it can be changed
// without a redeploy and a caller cannot ask for a model the shop cannot afford.

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
  let lastError: any = null;

  // 1. PRIMARY: the bot's AI proxy, which holds the provider key server-side and
  // names the model itself (see OPENROUTER_MODEL).
  {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 25000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl(AI_CHAT_ENDPOINT), {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ messages }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI proxy error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';

      return { text: cleanModelOutput(rawContent) };
    } catch (err) {
      lastError = err;
      console.warn(`[AI Proxy Failed]: ${err.message || err}. Falling back to Local SLM...`);
    } finally {
      clearTimeout(timeoutId);
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

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 45000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let streamResponse: Response;
  try {
    streamResponse = await fetch(apiUrl(AI_CHAT_ENDPOINT), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stream: true, messages }),
      signal: controller.signal
    });
    // Clear the connection timeout as soon as headers arrive, so the streaming
    // reader below is not aborted mid-generation.
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }

  if (!streamResponse.ok) {
    const errText = await streamResponse.text();
    throw new Error(`AI proxy stream error (${streamResponse.status}): ${errText}`);
  }

  if (!streamResponse.body) {
    throw new Error('AI proxy stream returned no body');
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
