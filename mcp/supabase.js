import { createClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from './net.js';

/**
 * Supabase clients for the MCP server.
 *
 * `service` bypasses RLS and is used only for public shop/catalog reads and the
 * order RPC. `user` carries the OAuth token and is used for customer-owned rows,
 * so RLS remains a second line of defence behind the server's own filters.
 */

// One resilient fetch shared by both clients: a stale pooled socket after an
// idle gap becomes a silent retry instead of an ECONNRESET the customer sees.
const resilientFetch = createSupabaseFetch();

const OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: resilientFetch },
};

export function serviceClient(config) {
  return createClient(config.supabaseUrl, config.serviceKey, OPTIONS);
}

export function userClient(config, accessToken) {
  return createClient(config.supabaseUrl, config.anonKey, {
    ...OPTIONS,
    // `headers` merges with OPTIONS.global.fetch, so the retry survives here too.
    global: { ...OPTIONS.global, headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
