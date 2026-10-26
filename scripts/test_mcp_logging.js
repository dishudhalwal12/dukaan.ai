import assert from 'assert';
import { OAuthError } from '@modelcontextprotocol/server';
import { hashId, toolLogLine, redact } from '../mcp/logging.js';
import { createServerFactory } from '../mcp/server.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { takeRetryCount, bumpRetryTally } from '../mcp/net.js';

console.log('--- RUNNING MCP LOGGING TESTS ---');
const hash = hashId('11111111-1111-4111-8111-111111111111');
assert.match(hash, /^[0-9a-f]{12}$/);
assert.notStrictEqual(hash, hashId('22222222-2222-4222-8222-222222222222'));
assert.strictEqual(hashId(''), null);
console.log('✓ 1: user ids are one-way hashed');

const line = toolLogLine({ tool: 'place_order', userId: '11111111-1111-4111-8111-111111111111', durationMs: 42, ok: true });
const parsed = JSON.parse(line);
assert.strictEqual(parsed.tool, 'place_order');
assert.strictEqual(parsed.user, hash);
assert.strictEqual(parsed.ms, 42);
assert.strictEqual(parsed.ok, true);
assert(!line.includes('11111111-1111-4111-8111-111111111111'), 'raw user id is not logged');
console.log('✓ 2: log lines carry a hash, tool name, duration, and outcome');

assert.strictEqual(redact('call 9876543210 or asha@example.com'), 'call [phone] or [email]');
assert.strictEqual(redact('12 MG Road, Jaipur'), '12 MG Road, Jaipur', 'addresses are not rewritten');
console.log('✓ 3: phone numbers and emails can be redacted from free text');

// ── the fields the new failure classes need ─────────────────────────────────
const rich = JSON.parse(toolLogLine({
  tool: 'find_shops',
  userId: '11111111-1111-4111-8111-111111111111',
  durationMs: 18,
  ok: true,
  code: 'net_error',
  retryCount: 1,
  shopCount: 7,
  precision: 'app_location',
}));
assert.strictEqual(rich.code, 'net_error', 'a retry is visible in the log');
assert.strictEqual(rich.retryCount, 1);
assert.strictEqual(rich.shopCount, 7);
assert.strictEqual(rich.precision, 'app_location');
console.log('✓ 4: retries, shop counts, and address provenance are logged');

// The line is a whitelist: free text must not slip in through a new argument.
const noisy = toolLogLine({
  tool: 'place_order',
  userId: '+919876543210',
  durationMs: 5,
  ok: false,
  note: 'Raj Sharma, 29 infront of hospital, 303604',
  address: '29 infront of hospital',
  phone: '+917678798767',
});
assert.ok(!noisy.includes('Raj Sharma'), 'no name leaks into the log');
assert.ok(!noisy.includes('303604'), 'no address leaks into the log');
assert.ok(!noisy.includes('7678798767'), 'no phone leaks into the log');
const noisyParsed = JSON.parse(noisy);
assert.strictEqual(noisyParsed.note, undefined);
assert.strictEqual(noisyParsed.address, undefined);
assert.match(noisyParsed.user, /^[0-9a-f]{12}$/, 'even a phone-shaped user id is hashed');
console.log('✓ 5: only whitelisted fields reach the log line');

assert.strictEqual(toolLogLine({ tool: 'x', userId: 'u', durationMs: 1, ok: true, retryCount: 'two' }).includes('retryCount'), false, 'a non-numeric retry count is dropped');
assert.strictEqual(toolLogLine({ tool: 'x', userId: 'u', durationMs: 1, ok: true, precision: 'guess' }).includes('precision'), false, 'an unknown provenance value is dropped');
console.log('✓ 6: malformed diagnostics are dropped rather than logged');

// ── the request log line is filled from the real request path ───────────────
assert.strictEqual(takeRetryCount(), 0);
bumpRetryTally();
assert.strictEqual(takeRetryCount(), 1);
assert.strictEqual(takeRetryCount(), 0, 'the counter drains, so one line reports one request');
console.log('✓ 7: retries are counted per request and drained by the logger');

const serverConfig = {
  supabaseUrl: 'http://localhost:54321',
  serviceKey: 'service',
  anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp',
  issuer: 'http://localhost:54321/auth/v1',
  googleKey: '',
  geocoderProvider: 'nominatim',
  enabled: true,
  allowInsecure: true,
  documentationUrl: '',
  expectedResource: '',
  allowedOrigins: [],
};
const verifier = {
  async verifyAccessToken(token) {
    if (token !== 'good-token') throw new OAuthError('invalid_token', 'bad token');
    return { token, clientId: 'c', scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { userId: '11111111-1111-4111-8111-111111111111' } };
  },
};
const shop = {
  shopId: 'shop_one', userId: '33333333-3333-4333-8333-333333333333', name: 'Ramu General Store',
  latitude: 26.9092, longitude: 75.1846, catalogItemCount: 3, deliveryRadiusKm: 5, mcpEnabled: true, ordersPaused: false,
};
const repo = {
  userId: '11111111-1111-4111-8111-111111111111',
  loadEnabledShops: async () => [shop],
  getShop: async () => shop,
  getCatalog: async () => [],
  getProfile: async () => ({
    location_lat: 26.9091549, location_lng: 75.1845856, location_accuracy_m: 43,
    location_source: 'gps', location_captured_at: new Date().toISOString(),
  }),
  listAddresses: async () => [],
  getAddressRow: async () => null,
};

// Drive the real tool path and inspect the bag the request logger reads.
// The HTTP transport rebuilds its context as `{ authInfo }`, so `extra` is the
// only channel that survives — the assertion below proves the bag arrives.
const requestDiagnostics = {};
const server = createServerFactory(serverConfig, { repo })({
  authInfo: { token: 't', clientId: 'c', scopes: [], expiresAt: 9e9, extra: { userId: repo.userId, diagnostics: requestDiagnostics } },
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'log-test', version: '1.0.0' }, { capabilities: {} });
await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
const res = await client.callTool({ name: 'find_shops', arguments: {} });
assert.strictEqual(res.isError, undefined, res.content?.[0]?.text);
await client.close();
await server.close();

const bag = requestDiagnostics;
assert.strictEqual(bag.shopCount, 1, 'the ranked shop count reaches the request logger');
assert.strictEqual(bag.precision, 'app_location', 'the address provenance reaches the request logger');

const lineForBag = toolLogLine({
  tool: 'find_shops',
  userId: repo.userId,
  durationMs: 12,
  ok: true,
  retryCount: 0,
  shopCount: bag.shopCount,
  precision: bag.precision,
});
const parsedLine = JSON.parse(lineForBag);
assert.strictEqual(parsedLine.shopCount, 1);
assert.strictEqual(parsedLine.precision, 'app_location');
assert.strictEqual(parsedLine.retryCount, 0);
assert.ok(!lineForBag.includes('7678798767'), 'no customer data in the line');
console.log('✓ 8: find_shops fills shopCount and precision, and the logger emits them');

console.log('\nAll MCP logging checks passed.');
