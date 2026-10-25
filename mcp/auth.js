import crypto from 'node:crypto';
import { OAuthError } from '@modelcontextprotocol/server';
import { parseJwtPayload } from './authConfig.js';

/**
 * Verifies Supabase-issued OAuth access tokens for the MCP server.
 *
 * Supabase Auth is the authorization server, so the resource server asks
 * `/auth/v1/user` whether the bearer token belongs to a live user. The result is
 * cached briefly: the POS already polls every 2.5 s, and a dashboard polling
 * loop must not double the project's auth traffic.
 */

const DEFAULT_TTL_MS = 60_000;
const FALLBACK_EXPIRY_SECONDS = 300;

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {{supabaseUrl: string, serviceKey?: string, anonKey?: string}} config
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]
 * @param {number} [options.ttlMs]
 * @param {Function} [options.now]
 */
export function createVerifier(config, { fetchImpl = globalThis.fetch, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const base = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const apiKey = String(config.serviceKey || config.anonKey || '');
  if (!base || !apiKey) throw new Error('Supabase URL and key are required to verify MCP tokens');

  const cache = new Map();
  const issuer = String(config.issuer || '').replace(/\/+$/, '');
  const expectedResource = String(config.expectedResource || '').replace(/\/+$/, '');

  async function verifyAccessToken(token) {
    const raw = String(token || '').trim();
    if (!raw) throw new OAuthError('invalid_token', 'A bearer token is required.');

    const key = hash(raw);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.info;
    if (hit) cache.delete(key);

    const payload = parseJwtPayload(raw);
    if (issuer && payload?.iss && String(payload.iss).replace(/\/+$/, '') !== issuer) {
      throw new OAuthError('invalid_token', 'The token was issued by a different authorization server.');
    }
    const expiresAt = Number.isFinite(payload?.exp)
      ? payload.exp
      : Math.floor(now() / 1000) + FALLBACK_EXPIRY_SECONDS;
    if (expiresAt <= Math.floor(now() / 1000)) throw new OAuthError('invalid_token', 'The token has expired.');

    let response;
    try {
      response = await fetchImpl(`${base}/auth/v1/user`, {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${raw}`,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new OAuthError('server_error', 'The token verifier is unavailable.');
    }

    if (!response || response.status !== 200) throw new OAuthError('invalid_token', 'The token is not valid.');

    let user;
    try {
      user = await response.json();
    } catch {
      throw new OAuthError('invalid_token', 'The token is not valid.');
    }
    const userId = user && user.id ? String(user.id) : '';
    if (!userId) throw new OAuthError('invalid_token', 'The token has no user.');

    const audience = Array.isArray(payload?.aud) ? payload.aud.map(String) : payload?.aud ? [String(payload.aud)] : [];
    const resource = expectedResource && audience.some((value) => value.replace(/\/+$/, '') === expectedResource)
      ? new URL(expectedResource)
      : undefined;

    const info = {
      token: raw,
      clientId: String(payload?.client_id || 'supabase-oauth'),
      scopes: String(payload?.scope || '').split(/\s+/).filter(Boolean),
      expiresAt,
      ...(resource ? { resource } : {}),
      extra: { userId, email: user.email || null },
    };
    cache.set(key, { info, expiresAt: Math.min(expiresAt * 1000, now() + ttlMs) });
    while (cache.size > 500) cache.delete(cache.keys().next().value);
    return info;
  }

  return { verifyAccessToken };
}

/** The authenticated user id carried by a verified AuthInfo. */
export function authUserId(authInfo) {
  const id = authInfo?.extra?.userId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
