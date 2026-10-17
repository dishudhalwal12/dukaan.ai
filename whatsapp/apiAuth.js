import crypto from 'node:crypto';

/**
 * Who may call what on the bot's HTTP API.
 *
 * The bot is reachable on a public tunnel, so the API is a trust boundary: an
 * unauthenticated caller must not be able to read another shop's orders, send
 * messages as the business number, or touch the WhatsApp session at all.
 *
 * Three policies:
 *   public   — reachable by anyone (a health check that needs a login is not a
 *              health check)
 *   auth     — any caller holding a valid Supabase access token
 *   operator — a valid token whose user id is in OPERATOR_USER_IDS; used for
 *              routes that act on the shared WhatsApp session or expose other
 *              people's conversations
 *
 * The policy table fails CLOSED: a route nobody declared is `auth`, never
 * `public`.
 */

const PUBLIC_EXACT = new Set(['/api/status']);

// Routes that act on the shared WhatsApp session, send as the business, or
// expose customer conversations. A plain logged-in shopkeeper must not reach
// these, because the WhatsApp link and the chat history are shared across every
// shop on this bot.
const OPERATOR_EXACT = new Set([
  '/api/send',
  '/api/dukan/ai-config',
  '/api/dukan/ai-test',
]);
const OPERATOR_PREFIXES = ['/api/chats', '/api/webhook'];

function normalizePath(p) {
  let s = String(p == null ? '/' : p);
  for (const sep of ['?', '#']) {
    const i = s.indexOf(sep);
    if (i !== -1) s = s.slice(0, i);
  }
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s.toLowerCase();
}

export function resolvePolicy(method, path) {
  const p = normalizePath(path);
  if (PUBLIC_EXACT.has(p)) return 'public';
  if (OPERATOR_EXACT.has(p)) return 'operator';
  if (OPERATOR_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return 'operator';
  return 'auth';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {object} options
 * @param {string} options.supabaseUrl  project URL, used to verify the token
 * @param {string} options.supabaseKey  project key, sent as `apikey`
 * @param {Function} [options.fetchImpl]
 * @param {number} [options.ttlMs]      how long a verified token is trusted
 * @param {number} [options.maxEntries] cap on the verification cache
 * @param {Function} [options.now]
 * @param {Set<string>} [options.operatorIds]
 */
export function createApiAuth({
  supabaseUrl = '',
  supabaseKey = '',
  fetchImpl = globalThis.fetch,
  ttlMs = 60000,
  maxEntries = 500,
  now = () => Date.now(),
  operatorIds = new Set(),
} = {}) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  const projectKey = String(supabaseKey || '');
  const operators = operatorIds instanceof Set ? operatorIds : new Set(operatorIds || []);

  // The POS polls orders every 2.5s. Verifying the token against Supabase on
  // every poll would double the project's request volume for no security gain,
  // so a verified token is trusted for `ttlMs`.
  const cache = new Map();

  function cached(token) {
    const hit = cache.get(hashToken(token));
    if (!hit) return null;
    if (hit.expiresAt <= now()) {
      cache.delete(hashToken(token));
      return null;
    }
    return hit.userId;
  }

  function remember(token, userId) {
    const key = hashToken(token);
    cache.delete(key);
    cache.set(key, { userId, expiresAt: now() + ttlMs });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  async function verify(token) {
    const hit = cached(token);
    if (hit) return hit;
    if (!base || !projectKey || typeof fetchImpl !== 'function') return null;
    let res;
    try {
      res = await fetchImpl(`${base}/auth/v1/user`, {
        headers: { apikey: projectKey, Authorization: `Bearer ${token}` },
      });
    } catch {
      return null; // a verification that cannot complete must not open the API
    }
    if (!res || res.status !== 200) return null;
    let user;
    try {
      user = await res.json();
    } catch {
      return null;
    }
    const userId = user && user.id ? String(user.id) : '';
    if (!userId) return null;
    remember(token, userId);
    return userId;
  }

  function bearer(headerValue) {
    const raw = String(headerValue == null ? '' : headerValue).trim();
    const match = /^Bearer\s+(.+)$/i.exec(raw);
    return match ? match[1].trim() : '';
  }

  /**
   * Express middleware. Mount as `app.use('/api', apiAuth.run)` BEFORE any
   * route, so no route can be reached without passing the policy.
   */
  function run(req, res, next) {
    const path = req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`;
    const policy = resolvePolicy(req.method, path);
    if (policy === 'public') return next();

    const token = bearer(req.headers && (req.headers.authorization || req.headers.Authorization));
    if (!token) return res.status(401).json({ error: 'unauthorized' });

    return verify(token).then(
      (userId) => {
        if (!userId) return res.status(401).json({ error: 'unauthorized' });
        req.auth = { userId, isOperator: operators.has(userId) };
        if (policy === 'operator' && !req.auth.isOperator) {
          return res.status(403).json({ error: 'forbidden' });
        }
        return next();
      },
      () => res.status(401).json({ error: 'unauthorized' }),
    );
  }

  return { policyFor: resolvePolicy, run, verify };
}
