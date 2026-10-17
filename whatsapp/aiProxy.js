/**
 * Server-side proxy for model calls.
 *
 * The browser used to call OpenRouter directly with a key injected at build
 * time, which meant the live key shipped inside the public bundle and every
 * shopkeeper's inventory prompt left from their own browser. Now the client
 * calls `/api/ai/chat/completions` on this bot, which holds the key in .env and
 * forwards upstream. Three things are decided here rather than trusted from the
 * caller:
 *
 *   * the upstream key is always the server's — a key in the request body is
 *     dropped, so a caller cannot spend someone else's quota;
 *   * the model comes from .env (`OPENROUTER_MODEL`, plus `AI_MODEL_FALLBACKS`)
 *     — a caller cannot ask for a model the shop's credit cannot afford;
 *   * `provider.data_collection` comes from `AI_DATA_COLLECTION` and defaults to
 *     'deny', so shop data is not retained or trained on by the provider.
 *
 * Note the interaction between the last two: OpenRouter's free models (`:free`)
 * only exist on endpoints that collect data, so a free model serves nothing
 * under `deny`. `AI_DATA_COLLECTION=allow` is then required — or point
 * `OPENROUTER_MODEL` at an ordinary (paid) model and keep the guarantee. The bot
 * logs one line at the first model call when the pair is contradictory.
 */

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Used when OPENROUTER_MODEL is unset; a paid model, so the default `deny` holds. */
export const DEFAULT_UPSTREAM_MODEL = 'meta-llama/llama-3.1-8b-instruct';

/** 'allow' only when asked for by name; anything else means 'deny'. */
export function resolveDataCollection(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase() === 'allow' ? 'allow' : 'deny';
}

/** "a, b ,c" -> ["a","b","c"] */
export function resolveFallbackModels(raw) {
  return String(raw == null ? '' : raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The model set a shop actually runs, from .env alone. */
export function resolveModelConfig(env = {}) {
  const model = String(env.OPENROUTER_MODEL || '').trim() || DEFAULT_UPSTREAM_MODEL;
  return {
    model,
    models: resolveFallbackModels(env.AI_MODEL_FALLBACKS),
    dataCollection: resolveDataCollection(env.AI_DATA_COLLECTION),
  };
}

export function buildUpstreamRequest({
  body = {},
  apiKey = '',
  referer = '',
  title = 'Dukaan.AI',
  model = DEFAULT_UPSTREAM_MODEL,
  models = [],
  dataCollection = 'deny',
} = {}) {
  // Never forward a caller-supplied key or model: the first would spend another
  // account's quota, the second could pick a model the shop cannot afford.
  const { api_key: _dropApiKey, model: _dropModel, models: _dropModels, ...safe } = body || {};

  const payload = {
    ...safe,
    model,
    provider: {
      ...(safe.provider && typeof safe.provider === 'object' ? safe.provider : {}),
      data_collection: resolveDataCollection(dataCollection),
    },
  };

  const fallbacks = (models || []).filter(Boolean);
  if (fallbacks.length) payload.models = fallbacks;
  else delete payload.models;

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
      body: JSON.stringify(payload),
    },
  };
}
