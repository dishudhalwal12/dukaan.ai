/**
 * Network resilience for the MCP server's database calls.
 *
 * THE FAILURE THIS FIXES
 * Production showed `quote_order` and `place_order` failing with
 *
 *   ECONNRESET: The socket connection was closed unexpectedly
 *
 * and succeeding when the assistant retried a second later. A warm Vercel
 * instance keeps Supabase's Node client alive between invocations, and that
 * client reuses pooled keep-alive sockets. After an idle gap — the customer
 * typing "yes" — the platform or an intermediary has already dropped the idle
 * socket, so the next request is the one that discovers it. Reads that follow
 * each other within a few hundred milliseconds share a live socket and never
 * see the problem, which is exactly the pattern in the production logs.
 *
 * WHY A RETRY AND NOT A KEEP-ALIVE TUNE
 * The clean fix would be to shorten the agent's idle timeout below the
 * platform's, but that requires the `undici` package (Agent/Dispatcher), and
 * this server deliberately has no extra runtime dependencies: every dependency
 * is bundle weight and attack surface inside a customer-facing function. A
 * single bounded retry reaches the same outcome — the retry opens a fresh
 * socket, because the pooled one is already gone — without a new dependency.
 *
 * WHY ONLY ONE RETRY, ONLY FOR SOCKETS
 * Two attempts turn the common case (one stale socket) into a success. More
 * attempts would multiply the load of a genuinely down database. HTTP responses
 * are answers, not transport failures: a 400/401/500 must reach the caller
 * unchanged, and a programming error must surface immediately rather than be
 * retried into a longer hang.
 */

/** Errors that mean "the socket died", not "the server said no". */
const SOCKET_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/**
 * Retries performed by the default wrapper during the current request. The
 * serverless instance is reused, so this is drained (not reset) by the request
 * logger: a line reporting retryCount 1 is exactly one recovered stale socket.
 */
let retryTally = 0;

export function bumpRetryTally() {
  retryTally += 1;
}

export function takeRetryCount() {
  const seen = retryTally;
  retryTally = 0;
  return seen;
}

/** True when the failure is transport-level and a fresh socket may succeed. */
export function isSocketError(error) {
  const code = String(error?.code || error?.cause?.code || '');
  if (SOCKET_CODES.has(code)) return true;
  // Fallback for nodes that throw a bare message without a code.
  return /socket hang up|socket connection was closed|ECONNRESET/i.test(String(error?.message || ''));
}

/**
 * Wrap a fetch so a dead socket is retried once.
 *
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]  underlying fetch (default: global)
 * @param {number}   [options.retries]     extra attempts after the first (default 1)
 * @param {Function} [options.onRetry]     called with the attempt number, for logging
 */
export function createResilientFetch({ fetchImpl = globalThis.fetch, retries = 1, onRetry } = {}) {
  const attempts = Math.max(0, Number(retries) || 0);

  return async function resilientFetch(input, init) {
    let attempt = 0;
    for (;;) {
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        if (attempt >= attempts || !isSocketError(error)) throw error;
        attempt += 1;
        // Retrying is safe for this wrapper because Supabase's client sends
        // string bodies: the request can be rebuilt byte for byte. Idempotency
        // of the underlying operation is a separate promise, made by the tools
        // (place_order through the quote, quote_order through its request hash).
        try {
          onRetry?.(attempt);
        } catch {
          // A logger must never break the request it is describing.
        }
      }
    }
  };
}

/** The fetch handed to both Supabase clients in mcp/supabase.js. */
export function createSupabaseFetch(options = {}) {
  return createResilientFetch({
    // Counting is the default, so every retry is visible in the request log
    // without every caller having to pass a logger.
    onRetry: () => bumpRetryTally(),
    ...options,
  });
}
