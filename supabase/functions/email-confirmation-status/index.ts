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
 * The response is a single boolean and nothing else, so a caller learns at most
 * what they already knew: whether an address has a confirmed account here. The
 * body is untrusted and is only ever used as a parameter to a
 * `SECURITY DEFINER` function, never interpolated into a query. A malformed
 * address is rejected before the database is touched, and the caller's IP is
 * rate-limited so the endpoint cannot be walked as a list.
 *
 * Deploy:  supabase functions deploy email-confirmation-status
 * Needs:   supabase_email_confirmation.sql applied (the RPC it calls).
 * Secrets: none to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
 *          by the platform. The service role is required because the RPC is
 *          revoked from anon and authenticated.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { isLikelyEmail, normalizeEmail, parseConfirmedFlag } from './logic.ts';

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

// Best-effort throttle. An instance is short-lived and there may be several, so
// this bounds a single caller's burst rather than guaranteeing a global limit —
// which is all the one-bit answer warrants.
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

  const callerIp = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  if (rateLimited(callerIp)) {
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