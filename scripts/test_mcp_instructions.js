import assert from 'assert';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { SERVER_INSTRUCTIONS, createServerFactory } from '../mcp/server.js';

/**
 * The assistant only behaves as well as its instructions. After the 2026-10-26
 * run it asked for a pincode/landmark twice, then silently substituted the GPS
 * fix when geocoding failed, then had to guess whether a failed write had landed.
 *
 * These assertions pin the three rules that came out of that run:
 *   1. collect name, phone, address — the same three the POS popup shows;
 *   2. never chase a landmark or pincode when a house line is already given;
 *   3. a failed write is retried once, because place_order is idempotent.
 */
console.log('--- RUNNING MCP INSTRUCTION TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const userId = '11111111-1111-4111-8111-111111111111';
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
  documentationUrl: '',
  expectedResource: '',
  allowedOrigins: [],
};

assert.match(SERVER_INSTRUCTIONS, /name/i);
assert.match(SERVER_INSTRUCTIONS, /phone/i);
assert.match(SERVER_INSTRUCTIONS, /address/i);
assert.match(
  SERVER_INSTRUCTIONS,
  /name, phone,? and address/i,
  'the three fields must be named together, so the model asks for them once'
);
ok('the instructions name name, phone, and address as one set');

assert.match(
  SERVER_INSTRUCTIONS,
  /do not ask for a landmark/i,
  'a typed house line is enough; chasing a landmark is what stalled the run'
);
ok('the instructions forbid chasing a landmark or pincode');

assert.match(SERVER_INSTRUCTIONS, /retry .{0,40}once/i);
assert.match(SERVER_INSTRUCTIONS, /place_order is idempotent|safe to retry/i);
ok('the instructions say a failed write is retried once, and why that is safe');

const server = createServerFactory(config, {
  repo: {
    userId,
    loadEnabledShops: async () => [],
    getShop: async () => null,
    getShopByUserId: async () => null,
    getCatalog: async () => [],
    getProfile: async () => null,
    saveProfile: async () => ({}),
    saveLocation: async () => ({}),
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
    findRecentQuote: async () => null,
  },
})({ authInfo: { token: 't', clientId: 'test', scopes: [], expiresAt: 9e9, extra: { userId } } });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'instructions-test', version: '1.0.0' }, { capabilities: {} });
await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
const { tools } = await client.listTools();
const saveAddress = tools.find((tool) => tool.name === 'save_address');
assert.ok(saveAddress, 'save_address is registered');
assert.match(saveAddress.description, /app location/i, 'the description says where the coordinate comes from');
assert.ok(
  !/otherwise pass the address text and the server geocodes it/i.test(saveAddress.description),
  'the description must not promise geocoding as the normal path'
);
const quoteOrder = tools.find((tool) => tool.name === 'quote_order');
assert.match(quoteOrder.description, /confirmation|confirm/i);
await client.close();
await server.close();
ok('save_address describes the app location, not a mandatory geocode');

console.log(`\nAll ${n} instruction checks passed.`);
