/**
 * Cross-origin policy for the bot's API.
 *
 * The API is reached from a browser that lives on a different origin (the
 * Vercel deployment), so it has to answer CORS. It used to answer
 * `Access-Control-Allow-Origin: *` for every caller, which let any website a
 * shopkeeper visited read their orders with their browser's session. The
 * allowlist below narrows that to the origins this app is actually served from.
 */

/** "a, b , c/" -> ["a","b","c"] */
export function parseOrigins(raw) {
  return String(raw == null ? '' : raw)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Exact-match origin check. Deliberately not a suffix/prefix/includes test:
 * `https://app.vercel.app.evil.example` must not pass because it "contains"
 * the allowed host.
 */
export function originAllowed(origin, allowedOrigins = []) {
  if (!origin) return true; // not a CORS request: curl, the bot's own calls
  const o = String(origin).replace(/\/+$/, '');
  return allowedOrigins.includes(o);
}

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function corsOptionsFor({ allowedOrigins = [], allowLocalhost = true } = {}) {
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const o = String(origin).replace(/\/+$/, '');
      if (allowedOrigins.includes(o)) return cb(null, true);
      if (allowLocalhost && LOCALHOST.test(o)) return cb(null, true);
      // No Access-Control-Allow-Origin header is sent, so the browser blocks the
      // response. Refusing here is not an error, it is the policy.
      return cb(null, false);
    },
    // The browser preflights the custom ngrok bypass header, and every /api call
    // carries the Supabase Bearer token, so both must be listed.
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  };
}
