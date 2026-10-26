/**
 * Which Supabase anon key the MCP server is actually allowed to use.
 *
 * WHY THIS EXISTS
 * The server holds two Supabase credentials:
 *
 *   1. `SUPABASE_SERVICE_KEY` — server-only, bypasses RLS. Used for public shop
 *      and catalog reads, and for the order RPC.
 *   2. an anon/publishable key — public by design, sent as the `apikey` header on
 *      every customer-scoped request whose real identity is the customer's OAuth
 *      token (in `Authorization`). RLS then scopes every row to that customer.
 *
 * The second one is the fragile half. A Supabase project can rotate its legacy
 * JWT secret, and a Vercel project can hold several copies of the key at once:
 * `SUPABASE_ANON_KEY` for the runtime, `VITE_SUPABASE_ANON_KEY` for the build,
 * plus publishable variants. When the runtime copy goes stale, nothing fails at
 * boot — the JWT still decodes, still says `ref: <this project>`, still says
 * `role: anon` — and every customer-owned tool then dies at request time with
 * PostgREST's "Invalid API key". That is exactly the failure this module ends.
 *
 * WHY IT PROBES INSTEAD OF COMPARING CLAIMS
 * Claims prove which project a key *claims* to belong to. They cannot prove the
 * project still accepts it, because rotation changes the signature, not the
 * payload. Only the project itself can answer that, so the resolver asks it once
 * (`GET /auth/v1/settings`, the cheapest authenticated endpoint) and caches the
 * verdict for the life of the serverless instance.
 *
 * WHERE THE RESOLVED KEY GOES
 * `config.anonKey` is mutated to the first candidate the project accepts, before
 * any Supabase client is constructed. `mcp/supabase.js` builds the per-request
 * user client from `config.anonKey`, so every customer-scoped tool then uses a
 * key that is known to work.
 */

/** Probe budget. A slow auth endpoint must never hold a tool call hostage. */
const PROBE_TIMEOUT_MS = 4000;

const normalise = (value) => String(value || '').trim();

/**
 * Ask the project whether it accepts a key.
 *
 * @returns {'ok' | 'invalid' | 'unknown'}
 *   `ok`      the project accepted the key (HTTP 200)
 *   `invalid` the project explicitly refused it (HTTP 401/403) — the bug we fix
 *   `unknown` the probe could not get an answer (offline, timeout, 5xx)
 *
 * `unknown` is deliberately NOT treated as `invalid`: a probe outage must never
 * take a working deployment down, so the caller keeps its current key.
 */
export async function verifyAnonKey(supabaseUrl, key, { fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const base = normalise(supabaseUrl).replace(/\/+$/, '');
  const candidate = normalise(key);
  if (!base || !candidate || typeof fetchImpl !== 'function') return 'unknown';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${base}/auth/v1/settings`, {
      headers: { apikey: candidate, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response?.status === 200) return 'ok';
    // 401 with {"message":"Invalid API key"} is Supabase refusing the key;
    // 403 is the same refusal through a proxy.
    if (response?.status === 401 || response?.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A per-instance resolver. The probe runs at most once per serverless instance:
 * `ensure()` memoises its promise, so a burst of tool calls shares one request.
 *
 * States:
 *   unchecked → no probe yet
 *   ok        → `config.anonKey` is accepted by the project
 *   invalid   → every candidate was refused; callers must fail with a configuration error
 *   unknown   → the probe could not answer; traffic continues with the preferred key
 *
 * @param {{ supabaseUrl: string, anonKey?: string, anonKeys?: string[] }} config
 */
export function createAnonKeyResolver(config, { fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  let status = 'unchecked';
  let inFlight = null;

  /** Ordered candidates: the preferred key first, then every other copy found in env. */
  const candidates = () => {
    const listed = Array.isArray(config.anonKeys) && config.anonKeys.length > 0 ? config.anonKeys : [config.anonKey];
    return [...new Set(listed.map(normalise).filter(Boolean))];
  };

  async function resolve() {
    const keys = candidates();
    if (keys.length === 0) {
      status = 'invalid';
      return status;
    }

    let sawUnknown = false;
    for (const key of keys) {
      const verdict = await verifyAnonKey(config.supabaseUrl, key, { fetchImpl, timeoutMs });
      if (verdict === 'ok') {
        // This is the whole point of the module: the next `userClient()` call
        // will be built with a key the project has just confirmed.
        config.anonKey = key;
        status = 'ok';
        return status;
      }
      if (verdict === 'unknown') sawUnknown = true;
    }

    // A refusal is actionable (fix the env var); a timeout is not, so an outage
    // leaves the deployment on its configured key instead of failing closed.
    status = sawUnknown ? 'unknown' : 'invalid';
    return status;
  }

  return {
    get status() {
      return status;
    },
    /** Resolve once and cache. Safe to call on every request. */
    ensure() {
      if (!inFlight) inFlight = resolve();
      return inFlight;
    },
  };
}
