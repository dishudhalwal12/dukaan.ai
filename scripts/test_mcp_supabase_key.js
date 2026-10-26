import assert from 'assert';
import { OAuthError } from '@modelcontextprotocol/server';
import { readConfig } from '../mcp/config.js';
import { createAnonKeyResolver, verifyAnonKey } from '../mcp/keys.js';
import { createFetchHandler } from '../mcp/server.js';
import { DataError } from '../mcp/data.js';
import { fromError } from '../mcp/result.js';

/**
 * The bug this suite exists for:
 *
 *   A production deploy returned, from every customer-owned tool,
 *   `profile_unavailable: Invalid API key`, while shop discovery still worked.
 *   Root cause: `userClient()` built with a Supabase anon key that the project
 *   had rotated away from. The old key still decodes, still says
 *   `ref: <project>` and `role: anon`, so the boot-time check accepted it.
 *
 * These checks pin the three behaviours that make that impossible to ship again:
 *   1. the server resolves the key it will actually use by asking the project,
 *   2. a refused key fails loudly with the variable name, not as a customer error,
 *   3. a probe outage is not treated as a refusal.
 */
console.log('--- RUNNING MCP SUPABASE KEY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const jwt = (payload) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

const validKey = jwt({ ref: 'project', role: 'anon', iat: 1_800_000_000 });
const rotatedKey = jwt({ ref: 'project', role: 'anon', iat: 1_700_000_000 });
const otherProjectKey = jwt({ ref: 'other-project', role: 'anon', iat: 1_800_000_000 });

// ── 1. Candidates: right project first, nothing dropped ──────────────────────
const configured = readConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_KEY: 'service',
  SUPABASE_ANON_KEY: rotatedKey,
  VITE_SUPABASE_ANON_KEY: validKey,
  MCP_PUBLIC_URL: 'https://dukaan.example/mcp',
});
assert.strictEqual(configured.anonKeys.length, 2, 'both copies are kept as fallbacks');
assert.ok(configured.anonKeys.includes(validKey) && configured.anonKeys.includes(rotatedKey));

const foreignFirst = readConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_KEY: 'service',
  SUPABASE_ANON_KEY: otherProjectKey,
  VITE_SUPABASE_ANON_KEY: validKey,
  MCP_PUBLIC_URL: 'https://dukaan.example/mcp',
});
assert.strictEqual(foreignFirst.anonKeys[0], validKey, 'a key from another project is not preferred');
assert.strictEqual(foreignFirst.anonKey, validKey);
ok('every copy of the public key is kept, right-project copies first');

// ── 2. The probe distinguishes refused from unreachable ─────────────────────
const acceptingProject = async (url, init) => {
  assert.match(String(url), /\/auth\/v1\/settings$/);
  const key = init?.headers?.apikey;
  return new Response('{}', { status: key === validKey ? 200 : 401 });
};
assert.strictEqual(await verifyAnonKey('https://project.supabase.co', validKey, { fetchImpl: acceptingProject }), 'ok');
assert.strictEqual(await verifyAnonKey('https://project.supabase.co', rotatedKey, { fetchImpl: acceptingProject }), 'invalid');

const offline = async () => {
  throw new Error('getaddrinfo ENOTFOUND');
};
assert.strictEqual(await verifyAnonKey('https://project.supabase.co', validKey, { fetchImpl: offline }), 'unknown');
const serverError = async () => new Response('upstream', { status: 503 });
assert.strictEqual(await verifyAnonKey('https://project.supabase.co', validKey, { fetchImpl: serverError }), 'unknown');
ok('a refused key is "invalid", an unreachable project is "unknown"');

// ── 3. The resolver swaps in the key the project accepts ───────────────────
const staleConfig = {
  supabaseUrl: 'https://project.supabase.co',
  anonKey: rotatedKey,
  anonKeys: [rotatedKey, validKey],
};
const resolver = createAnonKeyResolver(staleConfig, { fetchImpl: acceptingProject });
assert.strictEqual(resolver.status, 'unchecked');
assert.strictEqual(await resolver.ensure(), 'ok');
assert.strictEqual(staleConfig.anonKey, validKey, 'the clients are built with the accepted key');
assert.strictEqual(resolver.status, 'ok');
ok('a stale runtime key self-heals to the copy the project still accepts');

let probes = 0;
const countingFetch = async (url, init) => {
  probes++;
  return new Response('{}', { status: 200 });
};
const cached = createAnonKeyResolver({ supabaseUrl: 'https://project.supabase.co', anonKey: validKey }, { fetchImpl: countingFetch });
await Promise.all([cached.ensure(), cached.ensure(), cached.ensure()]);
await cached.ensure();
assert.strictEqual(probes, 1, 'one probe per instance, no matter how many tool calls arrive');
ok('the probe is cached across concurrent tool calls');

const allRefused = createAnonKeyResolver(
  { supabaseUrl: 'https://project.supabase.co', anonKey: rotatedKey, anonKeys: [rotatedKey, otherProjectKey] },
  { fetchImpl: async () => new Response('{}', { status: 401 }) }
);
assert.strictEqual(await allRefused.ensure(), 'invalid');
ok('when every copy is refused the instance reports invalid instead of guessing');

const flaky = { supabaseUrl: 'https://project.supabase.co', anonKey: validKey, anonKeys: [validKey] };
const flakyResolver = createAnonKeyResolver(flaky, { fetchImpl: offline });
assert.strictEqual(await flakyResolver.ensure(), 'unknown', 'a probe outage must not fail the deployment closed');
assert.strictEqual(flaky.anonKey, validKey, 'the configured key stays in place during an outage');
ok('an unreachable auth endpoint leaves traffic on the configured key');

// ── 4. The HTTP surface tells the truth ────────────────────────────────────
const verifier = {
  async verifyAccessToken(token) {
    if (token !== 'good-token') throw new OAuthError('invalid_token', 'bad token');
    return { token, clientId: 'c', scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { userId: 'u1' } };
  },
};

function handlerConfig(overrides = {}) {
  return {
    supabaseUrl: 'https://project.supabase.co',
    serviceKey: 'service',
    anonKey: overrides.anonKey || rotatedKey,
    anonKeys: overrides.anonKeys || [rotatedKey],
    publicUrl: 'http://localhost:8787/mcp',
    issuer: 'https://project.supabase.co/auth/v1',
    googleKey: '',
    geocoderProvider: 'nominatim',
    enabled: true,
    allowInsecure: true,
    documentationUrl: 'https://dukaan.example/connect',
    expectedResource: '',
    allowedOrigins: [],
  };
}

const brokenHandler = createFetchHandler(handlerConfig(), {
  verifier,
  fetchImpl: async () => new Response('{}', { status: 401 }),
});

const brokenHealth = await brokenHandler.fetch(new Request('http://localhost:8787/health'));
const brokenHealthBody = await brokenHealth.json();
assert.strictEqual(brokenHealth.status, 200, 'liveness stays 200 so /health can still be read');
assert.strictEqual(brokenHealthBody.supabaseKey, 'invalid');
assert.match(brokenHealthBody.warning || '', /SUPABASE_ANON_KEY/);
assert.ok(!JSON.stringify(brokenHealthBody).includes(rotatedKey), '/health never echoes a key');

const blocked = await brokenHandler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
);
assert.strictEqual(blocked.status, 503, 'a refused key stops the call with a configuration status');
const blockedBody = await blocked.json();
assert.strictEqual(blockedBody.error, 'server_misconfigured');
assert.strictEqual(blockedBody.variable, 'SUPABASE_ANON_KEY');
ok('an invalid key fails as server_misconfigured/503, not as a tool error');

const healedHandler = createFetchHandler(handlerConfig({ anonKeys: [rotatedKey, validKey] }), {
  verifier,
  fetchImpl: async (url, init) => new Response('{}', { status: init?.headers?.apikey === validKey ? 200 : 401 }),
});
const healedHealth = await (await healedHandler.fetch(new Request('http://localhost:8787/health'))).json();
assert.strictEqual(healedHealth.supabaseKey, 'ok', 'the fallback copy healed the deployment');

const initAllowed = await healedHandler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'key-test', version: '1.0.0' } },
    }),
  })
);
assert.strictEqual(initAllowed.status, 200, 'a healed key lets the client initialize');
ok('a deployment with a usable fallback key keeps serving');

// Injected clients (the other MCP suites) must not depend on a probe.
const injected = createFetchHandler(handlerConfig(), {
  verifier,
  repo: { userId: 'u1' },
  fetchImpl: async () => {
    throw new Error('no probe expected when a repo is injected');
  },
});
const injectedHealth = await (await injected.fetch(new Request('http://localhost:8787/health'))).json();
assert.strictEqual(injectedHealth.supabaseKey, 'skipped');
ok('tests that inject a repo never trigger a key probe');

// ── 5. A mid-life failure is still translated for the assistant ────────────
const mapped = fromError(new DataError('profile_unavailable', 'Invalid API key'));
assert.strictEqual(mapped.structuredContent.code, 'anon_key_invalid');
assert.match(mapped.content[0].text, /SUPABASE_ANON_KEY/);
assert.match(mapped.content[0].text, /not a customer credential/i);
assert.strictEqual(fromError(new DataError('profile_unavailable', 'connection reset')).structuredContent.code, 'profile_unavailable');
ok('"Invalid API key" becomes an operator error the assistant can relay correctly');

console.log(`\nAll ${n} Supabase key checks passed.`);
