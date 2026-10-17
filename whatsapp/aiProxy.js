/**
 * Server-side proxy for model calls.
 *
 * The browser used to call OpenRouter directly with a key injected at build
 * time, which meant the live key shipped inside the public bundle and every
 * shopkeeper's inventory prompt left from their own browser. Now the client
 * calls `/api/ai/chat/completions` on this bot, which holds the key in .env and
 * forwards upstream. Two guarantees are enforced here rather than trusted from
 * the caller:
 *
 *   * the upstream key is always the server's — a key in the request body is
 *     dropped, so a caller cannot spend someone else's quota;
 *   * `provider.data_collection` is always 'deny' — shop data is not retained
 *     or trained on by the model provider.
 */

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export function buildUpstreamRequest({ body = {}, apiKey = '', referer = '', title = 'Dukaan.AI' } = {}) {
  // Never forward a caller-supplied key: it would override the server's own.
  const { api_key: _dropApiKey, ...safe } = body || {};

  return {
    url: OPENROUTER_ENDPOINT,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(referer ? { 'HTTP-Referer': referer } : {}),
        'X-Title': title,
      },
      body: JSON.stringify({
        ...safe,
        provider: {
          ...(safe.provider && typeof safe.provider === 'object' ? safe.provider : {}),
          data_collection: 'deny',
        },
      }),
    },
  };
}
