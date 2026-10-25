import assert from 'assert';
import { OAuthError } from '@modelcontextprotocol/server';
import { createFetchHandler } from '../mcp/server.js';

console.log('--- RUNNING MCP HTTP SURFACE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const config = {
  supabaseUrl: 'http://localhost:54321',
  serviceKey: 'service',
  anonKey: 'anon',
  publicUrl: 'http://localhost:8787/mcp',
  issuer: 'http://localhost:54321/auth/v1',
  googleKey: '',
  geocoderProvider: 'nominatim',
  enabled: true,
  allowInsecure: true,
  documentationUrl: 'https://dukaan.ai/connect',
  expectedResource: '',
  allowedOrigins: [],
};

const verifier = {
  async verifyAccessToken(token) {
    if (token !== 'good-token') throw new OAuthError('invalid_token', 'bad token');
    return {
      token,
      clientId: 'test-client',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { userId: '11111111-1111-4111-8111-111111111111' },
    };
  },
};

const repo = {
  userId: '11111111-1111-4111-8111-111111111111',
  loadEnabledShops: async () => [],
  getShop: async () => null,
  getShopByUserId: async () => null,
  getCatalog: async () => [],
  getProfile: async () => null,
  saveProfile: async () => ({}),
  listAddresses: async () => [],
  getAddressRow: async () => null,
  saveAddress: async () => ({}),
  deleteAddress: async () => ({}),
  createQuote: async () => ({}),
  getQuote: async () => null,
  usageCounts: async () => ({ quotesLastHour: 0, ordersLastHour: 0, activeOrdersForShop: 0 }),
  placeOrder: async () => null,
  getOrder: async () => null,
  listOrders: async () => [],
  cancelOrder: async () => ({}),
};

const handler = createFetchHandler(config, { verifier, repo });

const health = await handler.fetch(new Request('http://localhost:8787/health'));
assert.strictEqual(health.status, 200);
assert.strictEqual((await health.json()).service, 'dukaan-mcp');
ok('health is public and leaks no secrets');

const discovery = await handler.fetch(new Request('http://localhost:8787/.well-known/oauth-protected-resource'));
assert.strictEqual(discovery.status, 200);
const metadata = await discovery.json();
assert.strictEqual(metadata.resource, 'http://localhost:8787/mcp');
assert.deepStrictEqual(metadata.authorization_servers, ['http://localhost:54321/auth/v1']);
assert.strictEqual(metadata.bearer_methods_supported[0], 'header');
ok('protected-resource discovery names the MCP resource and Supabase');

const unauth = await handler.fetch(new Request('http://localhost:8787/mcp', { method: 'POST' }));
assert.strictEqual(unauth.status, 401);
assert.match(unauth.headers.get('www-authenticate') || '', /resource_metadata/);
ok('an unauthenticated MCP call gets a discovery challenge');

const bad = await handler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer bad', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: '{}',
  })
);
assert.strictEqual(bad.status, 401);
ok('a rejected token is refused');

function parseBody(text) {
  if (text.trim().startsWith('{')) return JSON.parse(text);
  const line = text.split('\n').find((entry) => entry.startsWith('data:'));
  return line ? JSON.parse(line.slice(5).trim()) : null;
}

const init = await handler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer good-token',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'surface-test', version: '1.0.0' },
      },
    }),
  })
);
assert.strictEqual(init.status, 200);
const initBody = parseBody(await init.text());
assert.strictEqual(initBody.result.serverInfo.name, 'dukaan-ai');
ok('an authenticated client can initialize the MCP server');

const list = await handler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer good-token',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/list',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
);
const listText = await list.text();
if (list.status !== 200) console.log('tools/list diagnostic:', list.status, listText);
assert.strictEqual(list.status, 200);
const listBody = parseBody(listText);
const names = listBody.result.tools.map((tool) => tool.name);
for (const name of ['find_shops', 'search_products', 'quote_order', 'place_order', 'get_order', 'cancel_order', 'show_checkout']) {
  assert(names.includes(name), `${name} is registered`);
}
ok('the tool catalogue exposes the ordering flow');

const resources = await handler.fetch(
  new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer good-token',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'resources/list',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
);
assert.strictEqual(resources.status, 200);
const resourcesBody = parseBody(await resources.text());
assert(resourcesBody.result.resources.some((resource) => resource.uri === 'ui://dukaan/checkout.html'));
ok('the checkout card is listed as an MCP App resource');

await handler.close();
console.log(`\nAll ${n} MCP HTTP checks passed.`);
