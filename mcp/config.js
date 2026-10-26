/**
 * Runtime configuration for the MCP server.
 *
 * Read from the process environment only. The service key is server-side and
 * must never be exposed through Vite.
 */

import { parseJwtPayload } from './authConfig.js';

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

/**
 * A corrupted copy of the anon JWT can still look like a key but point at a
 * different project, or be the service-role key. Either makes every
 * user-scoped Supabase call fail with "Invalid API key". Fail at startup so
 * /health exposes the misconfiguration instead of every tool failing later.
 */
function assertAnonKey(config) {
  if (!String(config.anonKey || '').startsWith('eyJ')) return;
  const payload = parseJwtPayload(config.anonKey);
  if (!payload) return;
  const expectedRef = projectRefFromUrl(config.supabaseUrl);
  if (expectedRef && payload.ref && String(payload.ref) !== expectedRef) {
    throw new Error(`SUPABASE_ANON_KEY belongs to project "${payload.ref}", not "${expectedRef}".`);
  }
  if (payload.role && String(payload.role) !== 'anon') {
    throw new Error('SUPABASE_ANON_KEY must be the anon/publishable key, not a service-role key.');
  }
}

function anonKeyMatchesProject(key, supabaseUrl) {
  if (!String(key || '').startsWith('eyJ')) return false;
  const payload = parseJwtPayload(key);
  if (!payload) return false;
  const expectedRef = projectRefFromUrl(supabaseUrl);
  if (expectedRef && payload.ref && String(payload.ref) !== expectedRef) return false;
  return !payload.role || String(payload.role) === 'anon';
}

/**
 * Vercel can hold both a runtime SUPABASE_ANON_KEY and a build-time
 * VITE_SUPABASE_ANON_KEY. Prefer whichever actually belongs to this project,
 * so one stale copy cannot take every user-scoped tool down.
 */
function pickAnonKey(env, supabaseUrl) {
  const candidates = [
    env.SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return candidates.find((key) => anonKeyMatchesProject(key, supabaseUrl)) || candidates[0] || '';
}

export function readConfig(env = process.env) {
  const supabaseUrl = trimUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '');
  const anonKey = pickAnonKey(env, supabaseUrl);
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
  assertAnonKey(config);
  return config;
}
