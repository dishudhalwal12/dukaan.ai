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

const insecure = readConfig({ ...base, MCP_PUBLIC_URL: 'http://localhost:8787/mcp', MCP_ALLOW_INSECURE: 'true' });
assert.strictEqual(insecure.allowInsecure, true);
console.log('✓ 3: local insecure mode is explicit');

console.log('\nAll MCP config checks passed.');
