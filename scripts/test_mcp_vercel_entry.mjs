import assert from 'assert';
import http from 'node:http';
import { readFileSync } from 'node:fs';

/**
 * Exercises the Vercel entry and its Node<->Web adapter without Vercel:
 * the rewrite query must select the right route, and the response must be
 * written back to a real ServerResponse.
 */
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.MCP_PUBLIC_URL = 'http://localhost:8789/mcp';
process.env.MCP_AUTH_ISSUER = 'http://localhost:9999/auth/v1';
process.env.MCP_ALLOW_INSECURE = 'true';

const { default: handler } = await import('../api/mcp.js');

console.log('--- RUNNING MCP VERCEL ENTRY TESTS ---');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
for (const route of ['/health', '/mcp', '/.well-known/oauth-protected-resource', '/oauth/consent']) {
  assert(vercel.rewrites.some((rule) => rule.source === route), `vercel.json must route ${route}`);
}
console.log('✓ 0: vercel.json routes health, MCP, discovery, and consent');
const server = http.createServer((req, res) => handler(req, res));
await new Promise((resolve) => server.listen(8789, resolve));

try {
  const discovery = await fetch('http://localhost:8789/.well-known/oauth-protected-resource?__route=/.well-known/oauth-protected-resource');
  assert.strictEqual(discovery.status, 200);
  const metadata = await discovery.json();
  assert.strictEqual(metadata.resource, 'http://localhost:8789/mcp');
  console.log('✓ 1: the rewrite query serves protected-resource metadata');

  const unauth = await fetch('http://localhost:8789/mcp?__route=/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
  });
  assert.strictEqual(unauth.status, 401);
  assert.match(unauth.headers.get('www-authenticate') || '', /resource_metadata/);
  console.log('✓ 2: the rewired MCP route enforces bearer auth');

  const health = await fetch('http://localhost:8789/health?__route=/health');
  assert.strictEqual(health.status, 200);
  console.log('✓ 3: the /health rewrite serves the health JSON');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('\nAll Vercel-entry checks passed.');
