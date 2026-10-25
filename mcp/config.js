/**
 * Runtime configuration for the MCP server.
 *
 * Read from the process environment only. The service key is server-side and
 * must never be exposed through Vite.
 */

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function readConfig(env = process.env) {
  const supabaseUrl = trimUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '');
  const anonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '');
  const publicUrl = trimUrl(env.MCP_PUBLIC_URL || '');
  const issuer = trimUrl(env.MCP_AUTH_ISSUER || (supabaseUrl ? `${supabaseUrl}/auth/v1` : ''));
  const googleKey = String(env.GOOGLE_MAPS_API_KEY || '');
  const allowInsecure = String(env.MCP_ALLOW_INSECURE || '').toLowerCase() === 'true';

  return {
    supabaseUrl,
    serviceKey,
    anonKey,
    publicUrl,
    issuer,
    googleKey,
    geocoderProvider: String(env.MCP_GEOCODER_PROVIDER || (googleKey ? 'google' : 'nominatim')),
    enabled: String(env.MCP_ENABLED || 'true').toLowerCase() !== 'false',
    allowInsecure,
    documentationUrl: trimUrl(env.MCP_DOCS_URL || 'https://dukaan.ai/connect'),
    expectedResource: trimUrl(env.MCP_EXPECTED_RESOURCE || ''),
    allowedOrigins: String(env.MCP_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export function requireConfig(config) {
  const missing = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.serviceKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!config.anonKey) missing.push('SUPABASE_ANON_KEY');
  if (!config.issuer) missing.push('MCP_AUTH_ISSUER');
  if (!config.publicUrl) missing.push('MCP_PUBLIC_URL');
  if (missing.length > 0) {
    throw new Error(`MCP server is not configured. Missing: ${missing.join(', ')}`);
  }
  return config;
}
