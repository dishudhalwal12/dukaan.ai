import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createIsolatedSupabaseClient } from '../supabase.ts';

// The consent page is a customer surface. Keep its session out of the
// merchant app's auth key so approving an AI client cannot sign the shopkeeper
// out of their own dashboard.
const consentSupabase = createIsolatedSupabaseClient('dukan_oauth_consent_auth_token');

/**
 * Standalone OAuth consent page for MCP clients.
 *
 * Supabase Auth redirects here with `?authorization_id=...`. This page must not
 * mount the merchant app: a customer signing in to let ChatGPT order groceries
 * has no store and must not be pushed into merchant onboarding.
 */
const OAuthConsentScreen: React.FC = () => {
  const authorizationId = useMemo(() => new URLSearchParams(window.location.search).get('authorization_id') || '', []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authorizationId) {
      setError('This consent link is missing its authorization id. Start again from your AI app.');
      return;
    }
    const { data: sessionData } = await consentSupabase.auth.getSession();
    if (!sessionData.session) {
      setSignedInEmail(null);
      setDetails(null);
      return;
    }
    setSignedInEmail(sessionData.session.user.email || null);

    const { data, error: detailsError } = await consentSupabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailsError) {
      setError(detailsError.message);
      return;
    }
    if (data && 'redirect_url' in data) {
      window.location.assign(data.redirect_url);
      return;
    }
    setDetails(data);
    setError(null);
  }, [authorizationId]);

  useEffect(() => {
    void load();
    const { data } = consentSupabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authError } = await consentSupabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setLoading(false);
  };

  const signUp = async () => {
    setLoading(true);
    setError(null);
    const { data, error: authError } = await consentSupabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href },
    });
    if (authError) setError(authError.message);
    else if (!data.session) setNotice('Check your email to confirm the account, then come back to this page.');
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    setError(null);
    const { error: authError } = await consentSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (authError) setError(authError.message);
  };

  const decide = async (approve: boolean) => {
    setLoading(true);
    setError(null);
    const call = approve
      ? consentSupabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : consentSupabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    const { data, error: decisionError } = await call;
    if (decisionError) {
      setError(decisionError.message);
      setLoading(false);
      return;
    }
    if (data?.redirect_url) window.location.assign(data.redirect_url);
    else {
      setError('The authorization server did not return a redirect. Close this tab and try again.');
      setLoading(false);
    }
  };

  const redirectHost = (() => {
    try {
      return details?.redirect_uri ? new URL(details.redirect_uri).host : '';
    } catch {
      return '';
    }
  })();

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#3A3E98]">Dukaan.AI</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Connect an AI assistant</h1>
          <p className="text-sm text-gray-600 mt-2">
            Allow the assistant to find nearby shops, read catalog prices, and place orders that you confirm.
            It never receives your password.
          </p>
        </header>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        {!signedInEmail ? (
          <form onSubmit={signIn} className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A3E98]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A3E98]"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#3A3E98] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in and continue'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={signUp} disabled={loading} className="text-[#3A3E98] font-medium">
                Create an account
              </button>
              <button type="button" onClick={signInWithGoogle} disabled={loading} className="text-gray-700 underline">
                Use Google
              </button>
            </div>
          </form>
        ) : !details ? (
          <p className="text-sm text-gray-600">Loading the request…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Requested by</p>
              <p className="font-semibold text-gray-900">{details.client?.name || 'An AI assistant'}</p>
              {redirectHost && <p className="text-xs text-gray-500 mt-1">Returns to {redirectHost}</p>}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">This will allow it to:</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
                <li>Find nearby Dukaan shops and read their public catalogs</li>
                <li>Read your saved delivery addresses and place orders you explicitly confirm</li>
                <li>Read and cancel your own MCP orders before a shop accepts them</li>
              </ul>
            </div>

            <p className="text-xs text-gray-500">
              Signed in as {signedInEmail}. You can revoke this access later from your Supabase account's connected apps.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => decide(false)}
                disabled={loading}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-60"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => decide(true)}
                disabled={loading}
                className="flex-1 rounded-lg bg-[#27AE60] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default OAuthConsentScreen;
