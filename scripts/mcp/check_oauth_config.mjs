import { readConfig } from '../../mcp/config.js';

/**
 * Phase 0 check: proves the Supabase OAuth 2.1 server and the MCP discovery
 * documents are reachable before any tool is trusted.
 *
 *   node scripts/mcp/check_oauth_config.mjs
 *
 * Reads only public URLs. No service key is printed or required.
 */
const config = readConfig();
const failures = [];
const checks = [];

const pass = (name, detail = '') => checks.push({ ok: true, name, detail });
const fail = (name, detail = '') => {
  checks.push({ ok: false, name, detail });
  failures.push(name);
};

function pathInserted(serverUrl, wellKnown) {
  const url = new URL(serverUrl);
  return `${url.origin}/.well-known/${wellKnown}${url.pathname.replace(/\/+$/, '')}`;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return { error: `HTTP ${response.status}`, url };
    return { data: await response.json(), url };
  } catch (error) {
    return { error: error.message, url };
  } finally {
    clearTimeout(timer);
  }
}

if (!config.supabaseUrl) {
  fail('SUPABASE_URL is set');
} else {
  pass('SUPABASE_URL is set', config.supabaseUrl);
}

if (!config.issuer) {
  fail('MCP_AUTH_ISSUER is set');
} else {
  pass('MCP_AUTH_ISSUER is set', config.issuer);
}

if (!config.publicUrl) {
  fail('MCP_PUBLIC_URL is set', 'empty — set it in your shell or .env before rerunning');
} else if (config.publicUrl.startsWith('http://') && !config.allowInsecure) {
  fail('MCP_PUBLIC_URL uses HTTPS', config.publicUrl);
} else {
  pass('MCP_PUBLIC_URL is set', config.publicUrl);
}

let issuerDiscoveryUrl = '';
let issuerDiscovery = { error: 'MCP_AUTH_ISSUER is empty' };
if (config.issuer) {
  issuerDiscoveryUrl = pathInserted(config.issuer, 'oauth-authorization-server');
  issuerDiscovery = await getJson(issuerDiscoveryUrl);
}
if (issuerDiscovery.error) {
  fail('Supabase OAuth discovery responds', `${issuerDiscoveryUrl || '(no issuer)'} → ${issuerDiscovery.error}`);
} else {
  const meta = issuerDiscovery.data;
  pass('Supabase OAuth discovery responds', issuerDiscoveryUrl);
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'registration_endpoint']) {
    if (meta[field]) pass(`discovery has ${field}`, meta[field]);
    else fail(`discovery has ${field}`, 'missing — turn on OAuth 2.1 and dynamic client registration in Supabase');
  }
}

const metadataUrl = config.publicUrl ? pathInserted(config.publicUrl, 'oauth-protected-resource') : '';
const discovery = metadataUrl ? await getJson(metadataUrl) : { error: 'MCP_PUBLIC_URL is empty' };
if (discovery.error) {
  fail('MCP protected-resource metadata responds', `${metadataUrl} → ${discovery.error}. Deploy /mcp first, then rerun.`);
} else {
  const meta = discovery.data;
  pass('MCP protected-resource metadata responds', metadataUrl);
  if (meta.resource === config.publicUrl) pass('resource matches MCP_PUBLIC_URL', meta.resource);
  else fail('resource matches MCP_PUBLIC_URL', `${meta.resource || 'missing'} !== ${config.publicUrl}`);
  if (Array.isArray(meta.authorization_servers) && meta.authorization_servers.length > 0) {
    pass('authorization_servers is present', meta.authorization_servers.join(', '));
  } else {
    fail('authorization_servers is present');
  }
}

console.log('\nNukkad MCP — OAuth configuration check\n');
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed. See docs/mcp.md for the Supabase dashboard steps.`);
  process.exit(1);
}

console.log('\nAll OAuth discovery checks passed. Next: connect a real client with npx mcp-remote.');
console.log(`Endpoint: ${config.publicUrl}`);
