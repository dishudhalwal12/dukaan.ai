import { createClient } from '@supabase/supabase-js';

/**
 * Supabase clients for the MCP server.
 *
 * `service` bypasses RLS and is used only for public shop/catalog reads and the
 * order RPC. `user` carries the OAuth token and is used for customer-owned rows,
 * so RLS remains a second line of defence behind the server's own filters.
 */

const OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export function serviceClient(config) {
  return createClient(config.supabaseUrl, config.serviceKey, OPTIONS);
}

export function userClient(config, accessToken) {
  return createClient(config.supabaseUrl, config.anonKey, {
    ...OPTIONS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
