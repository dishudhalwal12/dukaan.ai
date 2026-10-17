/**
 * Transport helpers for every browser call to the bot's API.
 *
 * Kept free of browser globals so it can be unit-tested under plain node — the
 * caller passes `window.location` in rather than this module reaching for it.
 *
 * Two things live here that fix real deployment bugs:
 *   * the API origin can be moved off the page origin (VITE_API_BASE), so the
 *     Vercel deployment can call the backend directly without a proxy hop;
 *   * requests carry `ngrok-skip-browser-warning`, without which ngrok answers a
 *     browser-shaped request with its HTML warning page instead of JSON.
 */

export function resolveApiUrl(
  base: string | null | undefined,
  endpoint: string,
  location: { hostname?: string; port?: string } | null,
): string {
  const trimmed = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : '';
  if (trimmed) return `${trimmed}${endpoint}`;

  // Dev server on some port other than the bot's: talk to the bot directly. In
  // every other case the call is same-origin (in dev, Vite proxies /api).
  const isLocalDev =
    !!location &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    !!location.port &&
    location.port !== '5001';

  if (isLocalDev) return `http://localhost:5001${endpoint}`;
  return endpoint;
}

export function buildAuthHeaders(
  token: string | null | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra, 'ngrok-skip-browser-warning': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Incremental SSE frame parser. A network chunk can end mid-frame, so the
 * caller keeps `rest` and prepends it to the next chunk.
 */
export function parseSseBuffer(buffer: string): { messages: string[]; rest: string } {
  const parts = String(buffer).split('\n\n');
  const rest = parts.pop() ?? '';
  const messages: string[] = [];
  for (const block of parts) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length) messages.push(data.join('\n'));
  }
  return { messages, rest };
}
