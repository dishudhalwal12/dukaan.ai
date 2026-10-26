import assert from 'assert';
import { readConfig, requireConfig } from '../mcp/config.js';

console.log('--- RUNNING MCP CONFIG TESTS ---');
const base = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_KEY: 'service',
  SUPABASE_ANON_KEY: 'anon',
  MCP_AUTH_ISSUER: 'https://project.supabase.co/auth/v1',
};

const missing = readConfig(base);
assert.strictEqual(missing.publicUrl, '', 'MCP_PUBLIC_URL has no production default');
assert.throws(() => requireConfig(missing), /MCP_PUBLIC_URL/, 'a missing public URL fails fast');
console.log('✓ 1: a missing MCP_PUBLIC_URL is not silently replaced with localhost');

const configured = readConfig({ ...base, MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp' });
assert.strictEqual(configured.publicUrl, 'https://mcp.dukaan.ai/mcp');
assert.strictEqual(configured.issuer, 'https://project.supabase.co/auth/v1');
requireConfig(configured);
console.log('✓ 2: a complete config passes');

const jwt = (payload) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const wrongProject = readConfig({
  ...base,
  SUPABASE_ANON_KEY: jwt({ ref: 'other-project', role: 'anon' }),
  MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp',
});
assert.throws(() => requireConfig(wrongProject), /belongs to project/);
console.log('✓ 3: an anon key from another project is rejected');

const serviceAsAnon = readConfig({
  ...base,
  SUPABASE_ANON_KEY: jwt({ ref: 'project', role: 'service_role' }),
  MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp',
});
assert.throws(() => requireConfig(serviceAsAnon), /service-role/);
console.log('✓ 4: a service-role key is rejected as the anon key');

const validAnon = readConfig({
  ...base,
  SUPABASE_ANON_KEY: jwt({ ref: 'project', role: 'anon' }),
  MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp',
});
requireConfig(validAnon);
console.log('✓ 5: a matching anon key is accepted');

const fallbackAnon = readConfig({
  ...base,
  SUPABASE_ANON_KEY: jwt({ ref: 'other-project', role: 'anon' }),
  VITE_SUPABASE_ANON_KEY: jwt({ ref: 'project', role: 'anon' }),
  MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp',
});
assert.strictEqual(JSON.parse(Buffer.from(fallbackAnon.anonKey.split('.')[1], 'base64url').toString()).ref, 'project');
requireConfig(fallbackAnon);
console.log('✓ 6: a valid VITE anon key overrides a stale runtime anon key');

const insecure = readConfig({ ...base, MCP_PUBLIC_URL: 'http://localhost:8787/mcp', MCP_ALLOW_INSECURE: 'true' });
assert.strictEqual(insecure.allowInsecure, true);
console.log('✓ 7: local insecure mode is explicit');

// The live PRM used to advertise https://dukaan.ai/connect, which does not
// resolve; AI clients showed users a dead documentation link.
const docs = readConfig({ ...base, MCP_PUBLIC_URL: 'https://dukaan-ai-hypnexis.vercel.app/mcp' });
assert.strictEqual(docs.documentationUrl, 'https://dukaan-ai-hypnexis.vercel.app/connect');
assert.strictEqual(readConfig({ ...base, MCP_DOCS_URL: 'https://docs.example/connect', MCP_PUBLIC_URL: 'https://mcp.dukaan.ai/mcp' }).documentationUrl, 'https://docs.example/connect');
assert.strictEqual(readConfig({ ...base, MCP_PUBLIC_URL: 'not a url' }).documentationUrl, '', 'an unusable public URL yields no docs link');
console.log('✓ 8: the documentation link follows the MCP origin');

console.log('\nAll MCP config checks passed.');
