/**
 * Supabase Edge Function: email-confirmation-status
 *
 * Answers one bit — "has this email been confirmed?" — so a device that is
 * waiting on a confirmation can finish its sign-in without the confirmation
 * link ever being opened in that device's browser.
 *
 * ## Why this endpoint exists
 *
 * The email link lands in whichever browser the mail client picks (Gmail's
 * in-app webview, Chrome, a second device). The session it creates lives in
 * that browser's storage and is invisible everywhere else, and there is no
 * client-side API for "is this address confirmed yet" — an unconfirmed user has
 * no session, and `auth.users` is not exposed to PostgREST. So the answer has to
 * come from the server, and it has to be reachable without a session.
 *
 * ## What bounds the exposure
 *
 * The response is one bit and nothing else — no user id, no timestamp — but the
 * bit is real: a caller holding the public anon key can ask whether any given
 * address has a confirmed account here. That is an email enumeration oracle in
 * the technical sense, just a weak one. Three things keep it weak rather than
 * absent:
 *
 *   * the body is untrusted and is only ever passed as a parameter to a
 *     `SECURITY DEFINER` function, never interpolated into a query;
 *   * a malformed address is rejected before the database is touched;
 *   * callers are throttled by the hop the platform appended to
 *     `x-forwarded-for` (see `callerKey`), not by anything the caller supplies.
 *
 * The throttle is best-effort: it lives in one warm instance's memory and is
 * reset by a cold start, so it bounds a burst and does not prevent enumeration.
 * If enumeration ever matters, the fix is not a bigger limit — it is to stop
 * keying the answer on an arbitrary address, e.g. hand the waiting device a
 * nonce at signup that the server can look up instead.
 *
 * Deploy:  supabase functions deploy email-confirmation-status
 * Needs:   supabase_email_confirmation.sql applied (the RPC it calls).
 * Secrets: none to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
 *          by the platform. The service role is required because the RPC is
 *          revoked from anon and authenticated.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { callerKey, isLikelyEmail, normalizeEmail, parseConfirmedFlag } from './logic.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Best-effort throttle, keyed on the hop the platform appended (see callerKey).
// One instance's memory, reset by a cold start: it bounds a burst, it does not
// prevent enumeration.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const caller = callerKey(request.headers.get('x-forwarded-for'));
  if (rateLimited(caller)) {
    return json({ error: 'too many requests' }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const email = (payload as { email?: unknown })?.email;
  if (!isLikelyEmail(email)) {
    // Not a lookup failure, and not the caller's business to distinguish: an
    // address that cannot exist is simply not a confirmed account.
    return json({ confirmed: false });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'edge function is not configured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('is_email_confirmed', {
    p_email: normalizeEmail(email),
  });

  if (error) {
    console.warn('email-confirmation-status lookup failed:', error.message);
    return json({ error: 'lookup failed' }, 500);
  }

  return json({ confirmed: parseConfirmedFlag(data) });
});