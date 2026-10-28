import assert from 'assert';
import {
  protectedResourceMetadata,
  protectedResourceMetadataUrl,
  parseJwtPayload,
} from '../mcp/authConfig.js';

console.log('--- RUNNING MCP AUTH CONFIG TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const meta = protectedResourceMetadata({
  resourceUrl: 'https://mcp.dukaan.ai/mcp',
  issuer: 'https://project.supabase.co/auth/v1/',
  scopes: ['openid', 'email', 'profile'],
  documentationUrl: 'https://dukaan.ai/connect',
});
assert.strictEqual(meta.resource, 'https://mcp.dukaan.ai/mcp');
assert.deepStrictEqual(meta.authorization_servers, ['https://project.supabase.co/auth/v1']);
assert.deepStrictEqual(meta.bearer_methods_supported, ['header']);
assert.deepStrictEqual(meta.scopes_supported, ['openid', 'email', 'profile']);
assert.strictEqual(meta.resource_name, 'Nukkad AI Ordering');
assert.strictEqual(meta.resource_documentation, 'https://dukaan.ai/connect');
ok('protected resource metadata names the resource and the Supabase issuer');

assert.strictEqual(
  protectedResourceMetadataUrl('https://mcp.dukaan.ai/mcp'),
  'https://mcp.dukaan.ai/.well-known/oauth-protected-resource/mcp'
);
assert.strictEqual(
  protectedResourceMetadataUrl('https://mcp.dukaan.ai'),
  'https://mcp.dukaan.ai/.well-known/oauth-protected-resource'
);
ok('the metadata URL follows the RFC 9728 path insertion rule');

assert.throws(
  () => protectedResourceMetadata({ resourceUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:9999/auth/v1' }),
  /HTTPS/,
  'a plain-HTTP issuer is rejected outside localhost'
);
const local = protectedResourceMetadata({ resourceUrl: 'http://localhost:8787/mcp', issuer: 'http://localhost:9999/auth/v1', allowInsecure: true });
assert.strictEqual(local.authorization_servers[0], 'http://localhost:9999/auth/v1');
ok('insecure issuers require an explicit local-only opt-in');

const payload = { sub: 'user-1', exp: 1999999999, client_id: 'client-1' };
const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
assert.deepStrictEqual(parseJwtPayload(token), payload);
assert.strictEqual(parseJwtPayload('not-a-jwt'), null);
assert.strictEqual(parseJwtPayload('a.%%%.b'), null);
ok('JWT payload parsing is defensive');

console.log(`\nAll ${n} MCP auth-config checks passed.`);
