/**
 * Supabase Edge Function: capture-session
 *
 * Writes one `device_sessions` row per app load, filling in the block a browser
 * cannot know: the caller's IP (hashed, never stored) and the geography derived
 * from it.
 *
 * No service-role key is used or needed. The function acts AS THE CALLER, with
 * their access token, so the insert is subject to the same row-level security as
 * a write from the app: `user_id` is taken from the verified token and a caller
 * cannot file a session under another shop.
 *
 * The request body is untrusted and is filtered to the client-owned columns
 * before it reaches the table.
 *
 * Deploy:  supabase functions deploy capture-session
 * No secrets to set — SUPABASE_URL and SUPABASE_ANON_KEY are injected by the
 * platform, and the caller's own token authorises the write.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildServerFields,
  extractClientIp,
  lookupIpGeo,
  pickSessionColumns,
} from './logic.ts';

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

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'missing bearer token' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'edge function is not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const session = pickSessionColumns((payload as { session?: unknown })?.session);
  if (typeof session.session_id !== 'string' || session.session_id.length === 0) {
    return json({ error: 'session_id is required' }, 400);
  }

  const serverFields = await buildServerFields(extractClientIp(request.headers), lookupIpGeo);

  const { error: writeError } = await supabase.from('device_sessions').upsert(
    {
      ...session,
      ...serverFields,
      user_id: userData.user.id,
      captured_by: 'edge_function',
    },
    { onConflict: 'user_id,session_id' },
  );

  if (writeError) {
    return json({ error: writeError.message }, 400);
  }

  return json({ ok: true, captured_by: 'edge_function' });
});
