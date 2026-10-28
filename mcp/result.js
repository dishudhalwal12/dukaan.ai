/** Uniform tool results: a readable text line plus structured data for hosts. */

export function ok(text, structured = {}) {
  return {
    content: [{ type: 'text', text }],
    structuredContent: { ok: true, ...structured },
  };
}

export function fail(code, message, details = undefined) {
  const payload = { ok: false, code, message, ...(details === undefined ? {} : { details }) };
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: payload,
  };
}

/**
 * Data-layer codes that all mean "the server could not read/write a Supabase row".
 * They share one failure mode worth translating: PostgREST's "Invalid API key".
 */
const DATABASE_CODES = new Set([
  'profile_unavailable',
  'address_unavailable',
  'address_save_failed',
  'address_delete_failed',
  'quote_unavailable',
  'quote_save_failed',
  'order_unavailable',
  'order_update_failed',
  'registry_unavailable',
  'catalog_unavailable',
  'limit_unavailable',
  'location_save_failed',
  'location_clear_failed',
]);

/**
 * Turns a thrown DataError into a tool result.
 *
 * One translation matters more than the rest. When Supabase answers "Invalid API
 * key", the server's own anon key has been refused (usually a rotated key still
 * sitting in a Vercel env var). Passed through untouched, that surfaces as
 * `profile_unavailable: Invalid API key`, which sounds like the customer's
 * credential and made an assistant advise "re-authenticate the Nukkad MCP
 * server" — advice that can never work, because the key lives on the server.
 * Naming the variable and the operator is what lets the assistant say something
 * true instead.
 */
export function fromError(error, fallbackCode = 'internal_error') {
  let code = error?.code && typeof error.code === 'string' ? error.code : fallbackCode;
  let message = error?.message || 'Something went wrong.';

  if (DATABASE_CODES.has(code) && /invalid api key/i.test(message)) {
    code = 'anon_key_invalid';
    message =
      'The Nukkad MCP server cannot reach the database: its SUPABASE_ANON_KEY is not valid for the project. '
      + 'This is a server configuration problem, not a customer credential — re-authenticating will not fix it. '
      + 'Tell the Nukkad operator to update SUPABASE_ANON_KEY (or check /health).';
  }

  return fail(code, message);
}
