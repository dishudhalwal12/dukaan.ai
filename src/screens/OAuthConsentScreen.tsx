import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createIsolatedSupabaseClient, isSupabaseConfigured } from '../supabase.ts';
import { GoogleIcon } from '../components/Icons.tsx';
import LocationModal from '../components/LocationModal.tsx';
import type { StoreLocation } from '../utils/location.ts';
import {
  cacheCustomerLocation,
  describeSavedLocation,
  fetchCustomerLocation,
  removeCustomerLocation,
  saveCapturedCustomerLocation,
  type SavedCustomerLocation,
} from '../services/customerLocation.ts';

// The consent page is a customer surface. Keep its session out of the
// merchant app's auth key so approving an AI client cannot sign the shopkeeper
// out of their own dashboard.
const consentSupabase = createIsolatedSupabaseClient('dukan_oauth_consent_auth_token');

/**
 * A redirect that never came back (the Google window was closed) leaves the
 * button spinning forever. This marker is deliberately NOT the merchant app's
 * `dukan-oauth-in-progress`: the two surfaces share an origin, and writing the
 * shell's marker would make the POS believe a merchant login is pending.
 */
const CONSENT_OAUTH_KEY = 'dukan-oauth-consent-in-progress';
const LOCATION_ASKED_KEY = 'dukan-consent-location-asked';
const GOOGLE_STUCK_MS = 15_000;

const PERMISSIONS: { icon: string; text: string }[] = [
  { icon: 'storefront', text: 'Find nearby shops and read their public prices' },
  { icon: 'location_on', text: 'Use the delivery addresses you saved' },
  { icon: 'receipt_long', text: 'Place orders that you confirm, and show their status' },
  { icon: 'do_not_disturb_on', text: 'Cancel your own order before the shop accepts it' },
];

type Busy = null | 'signin' | 'signup' | 'google' | 'approve' | 'deny' | 'switch';

const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
  />
);

const Alert: React.FC<{ tone: 'error' | 'notice' | 'success'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = {
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    notice: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  } as const;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
};

/**
 * The policy shown from the consent line.
 *
 * Deliberately NOT the merchant PrivacyPolicyScreen: that screen reads the
 * language context, which only exists inside the POS shell, and its copy is
 * about a shopkeeper's store and stock. A customer connecting an assistant needs
 * the short version, and a page that crashes on "Privacy Policy" is worse than
 * no link at all.
 */
const PRIVACY_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What this page collects',
    body: [
      'Your email and password, handled by Supabase Auth. The assistant never receives your password.',
      'A position, only if you tap Allow location. It is stored on your own Dukaan account.',
    ],
  },
  {
    title: 'Why the position is saved',
    body: [
      'So the assistant can find the shops that deliver near you on the first message, instead of asking you to type a pincode.',
      'A position is not a delivery address. A shop still needs a full address and a phone number before an order exists.',
      'It is used for that lookup only. It is not sold, and it is not shown to the assistant beyond the shop search.',
    ],
  },
  {
    title: 'What the assistant can see',
    body: [
      'Nearby shops and their public prices.',
      'The delivery addresses you save, and the orders you place through it.',
      'Nothing else: no password, no dashboard, no other customer.',
    ],
  },
  {
    title: 'Changing your mind',
    body: [
      'Update or remove the saved position on this page at any time.',
      'Denying or revoking the assistant here or in your AI app cuts its access immediately.',
    ],
  },
];

const PrivacySheet: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="fixed inset-0 z-[60] overflow-y-auto bg-black text-white">
    <div className="mx-auto w-full max-w-md px-4 pb-12 pt-4">
      <header className="flex items-center gap-2 pb-5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-neutral-900"
          aria-label="Back to sign in"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
        </button>
        <h1 className="text-lg font-bold tracking-tight">Privacy</h1>
      </header>

      <div className="space-y-5">
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl border border-neutral-800 bg-[#1A1A1A] p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E6E6FA]">{section.title}</h2>
            <ul className="mt-2 space-y-2">
              {section.body.map((line) => (
                <li key={line} className="text-sm leading-relaxed text-neutral-300">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-6 w-full rounded-xl bg-[#E6E6FA] px-4 py-3 text-sm font-bold text-black hover:opacity-90"
      >
        Back to sign in
      </button>
    </div>
  </div>
);

/** The saved-position row: one line of truth plus Update / Remove. */
const LocationRow: React.FC<{
  location: SavedCustomerLocation | null;
  busy: boolean;
  disabled: boolean;
  onShare: () => void;
  onRemove: () => void;
}> = ({ location, busy, disabled, onShare, onRemove }) => (
  <div className="rounded-xl border border-neutral-800 p-3">
    <div className="flex items-start gap-2.5">
      <span className="material-symbols-outlined mt-px text-lg leading-none text-[#E6E6FA]">location_on</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white">
          {location ? 'Location saved' : 'No location yet'}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
          {location
            ? `${describeSavedLocation(location)}. Used to find shops near you.`
            : 'Share it once and your assistant names the nearest shop without asking. Delivery still needs a full address.'}
        </p>
      </div>
      {busy && <Spinner className="mt-0.5 h-3.5 w-3.5 text-neutral-400" />}
    </div>
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={onShare}
        disabled={disabled}
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
      >
        {location ? 'Update' : 'Share location'}
      </button>
      {location && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:text-red-300 disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  </div>
);

/**
 * Standalone OAuth consent page for MCP clients.
 *
 * Supabase Auth redirects here with `?authorization_id=...`. This page must not
 * mount the merchant app: a customer signing in to let ChatGPT order groceries
 * has no store and must not be pushed into merchant onboarding.
 *
 * Two things happen here, in the order the POS onboarding does them: sign in
 * (Google button and consent line identical to the merchant sheet), then capture
 * the customer's position with the same location sheet the shopkeeper sees, so
 * the assistant already knows where they are when the first chat opens.
 *
 * Visual language matches the shopkeeper POS: black canvas, off-white accent,
 * charcoal surfaces.
 */
const OAuthConsentScreen: React.FC = () => {
  const authorizationId = useMemo(() => new URLSearchParams(window.location.search).get('authorization_id') || '', []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signedInUserId, setSignedInUserId] = useState<string>('');
  const [details, setDetails] = useState<any>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [location, setLocation] = useState<SavedCustomerLocation | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const load = useCallback(async () => {
    setChecking(true);

    if (!authorizationId) {
      setSignedInEmail(null);
      setSignedInUserId('');
      setDetails(null);
      setError('This consent link is missing its authorization id. Start again from your AI app.');
      setChecking(false);
      return;
    }

    if (!isSupabaseConfigured()) {
      setDetails(null);
      setError('Sign-in is not configured for this build. Try again from the published Dukaan app.');
      setChecking(false);
      return;
    }


    try {
      const { data: sessionData, error: sessionError } = await consentSupabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (!sessionData.session) {
        setSignedInEmail(null);
        setSignedInUserId('');
        setDetails(null);
        return;
      }

      // The redirect completed, so a stale "still on Google" marker is a lie.
      try {
        localStorage.removeItem(CONSENT_OAUTH_KEY);
      } catch {
        // Storage disabled; nothing to clear.
      }

      const user = sessionData.session.user;
      setSignedInEmail(user.email || 'your account');
      setSignedInUserId(user.id || '');
      setError(null);

      const [saved, { data, error: detailsError }] = await Promise.all([
        fetchCustomerLocation(consentSupabase, user.id || ''),
        consentSupabase.auth.oauth.getAuthorizationDetails(authorizationId),
      ]);

      if (saved) setLocation(saved);

      if (detailsError) {
        setDetails(null);
        setError(detailsError.message);
        return;
      }

      // Already approved or denied earlier: the server hands back where to go.
      if (data && 'redirect_url' in data && data.redirect_url) {
        window.location.assign(data.redirect_url);
        return;
      }

      setDetails(data);
      setNotice(null);
    } catch (caught: any) {
      // A thrown (not returned) Supabase/network error used to leave the page
      // on "Checking your session…" forever.
      setDetails(null);
      setError(caught?.message || 'Could not reach Dukaan sign-in. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  }, [authorizationId]);

  useEffect(() => {
    void load();
    // `load` is not awaited inside the callback: awaiting a Supabase call in
    // onAuthStateChange can deadlock the auth client.
    const { data } = consentSupabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load, reloadKey]);

  // Ask for the position once, after sign-in, when nothing is saved yet. The tab
  // remembers a "Not now" so the sheet cannot reopen on every render.
  useEffect(() => {
    if (checking || !details || !signedInUserId) return;
    if (location || locationSheetOpen) return;
    let asked = false;
    try {
      asked = sessionStorage.getItem(LOCATION_ASKED_KEY) === '1';
    } catch {
      asked = false;
    }
    if (!asked) setLocationSheetOpen(true);
  }, [checking, details, signedInUserId, location, locationSheetOpen]);

  // Closing Google's window leaves this page exactly as it was: nothing resets
  // the button, so it spins until the tab is reloaded. Recovery matters more
  // here than in the merchant sheet — this page IS the sign-in.
  useEffect(() => {
    if (busy !== 'google') return;

    let settled = false;
    const reset = async () => {
      if (settled || document.visibilityState === 'hidden') return;
      let signedIn = false;
      try {
        const { data } = await consentSupabase.auth.getSession();
        signedIn = Boolean(data?.session?.user);
      } catch {
        signedIn = false;
      }
      if (settled || signedIn) return;
      settled = true;
      try {
        localStorage.removeItem(CONSENT_OAUTH_KEY);
      } catch {
        // Ignore storage errors.
      }
      setBusy(null);
      setError('Sign-in was cancelled. You can try again whenever you are ready.');
    };

    const timer = window.setTimeout(reset, GOOGLE_STUCK_MS);
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('focus', reset);
    window.addEventListener('pageshow', reset);

    return () => {
      settled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('focus', reset);
      window.removeEventListener('pageshow', reset);
    };
  }, [busy]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy('signin');
    try {
      const { error: authError } = await consentSupabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) setError(authError.message);
    } catch (caught: any) {
      setError(caught?.message || 'Sign-in failed. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const signUp = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters to create an account.');
      return;
    }
    setBusy('signup');
    try {
      const { data, error: authError } = await consentSupabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.href },
      });
      if (authError) setError(authError.message);
      else if (!data?.session) setNotice('Check your email to confirm the account, then come back to this page.');
      // With a session, onAuthStateChange loads the request and the page moves on.
    } catch (caught: any) {
      setError(caught?.message || 'Could not create the account. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const signInWithGoogle = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy('google');
    try {
      localStorage.setItem(CONSENT_OAUTH_KEY, 'true');
    } catch {
      // Storage disabled: the timeout below still recovers the button.
    }
    try {
      const { error: authError } = await consentSupabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      });
      if (authError) {
        try {
          localStorage.removeItem(CONSENT_OAUTH_KEY);
        } catch {
          // Ignore.
        }
        setError(authError.message);
        setBusy(null);
      }
      // On success the browser navigates to Google; the focus/timeout guard owns
      // the button until then.
    } catch (caught: any) {
      try {
        localStorage.removeItem(CONSENT_OAUTH_KEY);
      } catch {
        // Ignore.
      }
      setError(caught?.message || 'Could not open Google sign-in. Try again.');
      setBusy(null);
    }
  };

  const decide = async (approve: boolean) => {
    if (busy) return;
    setError(null);
    setBusy(approve ? 'approve' : 'deny');
    try {
      const { data, error: decisionError } = approve
        ? await consentSupabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await consentSupabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

      if (decisionError) {
        setError(decisionError.message);
        return;
      }
      if (data?.redirect_url) {
        window.location.assign(data.redirect_url);
        return;
      }
      setError('The authorization server did not return a redirect. Close this tab and try again.');
    } catch (caught: any) {
      setError(caught?.message || 'The decision did not reach Dukaan. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const switchAccount = async () => {
    if (busy) return;
    setBusy('switch');
    try {
      await consentSupabase.auth.signOut();
    } catch {
      // A failed sign-out still shows the form below, so the user can retry.
    }
    setSignedInEmail(null);
    setSignedInUserId('');
    setDetails(null);
    setEmail('');
    setPassword('');
    setError(null);
    setNotice(null);
    setLocation(null);
    setLocationNote(null);
    setLocationSheetOpen(false);
    try {
      sessionStorage.removeItem(LOCATION_ASKED_KEY);
    } catch {
      // Ignore.
    }
    setBusy(null);
    // The auth client fires SIGNED_OUT as well; the extra key makes the reset
    // reliable even when no session was stored.
    setReloadKey((key) => key + 1);
  };

  const handleLocationCaptured = async (captured: StoreLocation) => {
    setLocationSheetOpen(false);
    if (!signedInUserId) {
      setError('Sign in again before sharing a location.');
      return;
    }
    setLocationBusy(true);
    setLocationNote(null);
    setError(null);
    try {
      const result = await saveCapturedCustomerLocation(consentSupabase, signedInUserId, captured);
      if (result.status === 'saved') {
        setLocation(result.location);
        cacheCustomerLocation(result.location);
        setLocationNote('Location saved. Your assistant can find shops near you now.');
        return;
      }
      if (result.reason === 'schema_pending') {
        // The live project may not have run migration 2026-10-28 yet. Keep the
        // value on this device, say so plainly, and never block approval.
        const local: SavedCustomerLocation = {
          lat: captured.lat,
          lng: captured.lng,
          accuracyM: captured.accuracy_m ?? null,
          source: captured.source,
          capturedAt: captured.captured_at || new Date().toISOString(),
          label: null,
        };
        setLocation(local);
        cacheCustomerLocation(local);
        setLocationNote(result.message);
        return;
      }
      setError(result.message);
    } catch (caught: any) {
      setError(caught?.message || 'The location could not be saved.');
    } finally {
      setLocationBusy(false);
    }
  };

  const handleRemoveLocation = async () => {
    if (!signedInUserId || locationBusy) return;
    setLocationBusy(true);
    setLocationNote(null);
    setError(null);
    try {
      const result = await removeCustomerLocation(consentSupabase, signedInUserId);
      if (result.status !== 'removed') {
        setError(result.message || 'The location could not be removed.');
        return;
      }
      setLocation(null);
      cacheCustomerLocation(null);
      setLocationNote('Location removed. The assistant will ask for an area instead.');
      try {
        sessionStorage.removeItem(LOCATION_ASKED_KEY);
      } catch {
        // Ignore.
      }
    } catch (caught: any) {
      setError(caught?.message || 'The location could not be removed.');
    } finally {
      setLocationBusy(false);
    }
  };

  const skipLocation = () => {
    setLocationSheetOpen(false);
    try {
      sessionStorage.setItem(LOCATION_ASKED_KEY, '1');
    } catch {
      // Storage disabled: the sheet simply asks again next time.
    }
  };

  const redirectHost = (() => {
    try {
      return details?.redirect_uri ? new URL(details.redirect_uri).host : '';
    } catch {
      return '';
    }
  })();

  const linkMissing = !authorizationId;

  if (showPrivacy) {
    return <PrivacySheet onBack={() => setShowPrivacy(false)} />;
  }

  return (
    <main className="min-h-screen w-full bg-black px-4 py-8 text-white sm:py-12">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E6E6FA] text-black">
            <span className="font-manrope text-xl font-extrabold leading-none">D</span>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight tracking-tight text-[#E6E6FA]">Dukaan.AI</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Connect an AI assistant
            </p>
          </div>
        </header>

        <div className="rounded-2xl border border-neutral-800 bg-[#1A1A1A] p-5 sm:p-6">
          {checking ? (
            <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
              <div className="h-5 w-2/3 animate-pulse rounded bg-[#2D2D2D]" />
              <div className="h-3 w-full animate-pulse rounded bg-[#2D2D2D]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#2D2D2D]" />
              <p className="flex items-center gap-2 pt-1 text-xs text-neutral-500">
                <Spinner className="h-3 w-3" /> Checking your session…
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {signedInEmail && details ? 'Allow this assistant?' : 'Connect an AI assistant'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                {signedInEmail && details
                  ? 'It will act inside Dukaan as you. Approve only if you started this from your own AI app.'
                  : 'Sign in so your assistant can look up nearby shops and place orders you confirm. It never receives your password.'}
              </p>

              {(error || notice) && (
                <div className="mt-4 space-y-2">
                  {error && <Alert tone="error">{error}</Alert>}
                  {notice && <Alert tone="notice">{notice}</Alert>}
                </div>
              )}

              {!signedInEmail ? (
                linkMissing ? null : (
                  <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      disabled={Boolean(busy)}
                      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-neutral-100 disabled:opacity-50"
                    >
                      {busy === 'google' ? (
                        <Spinner className="h-5 w-5 text-neutral-800" />
                      ) : (
                        <>
                          <GoogleIcon className="h-5 w-5 shrink-0" />
                          <span>Continue with Google</span>
                        </>
                      )}
                    </button>

                    {/* Google's own consent screen is configured in the Google and
                        Supabase dashboards; this is the in-app half. */}
                    <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                      By continuing you agree to our{' '}
                      <button
                        type="button"
                        onClick={() => setShowPrivacy(true)}
                        className="text-neutral-300 underline underline-offset-2 hover:text-white"
                      >
                        Privacy Policy
                      </button>
                    </p>

                    <div className="flex items-center py-1">
                      <div className="h-px flex-1 bg-neutral-800" />
                      <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        or email
                      </span>
                      <div className="h-px flex-1 bg-neutral-800" />
                    </div>

                    <form onSubmit={signIn} className="space-y-3">
                      <label htmlFor="consent-email" className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Email</span>
                        <input
                          id="consent-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-transparent bg-[#2D2D2D] px-3 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#E6E6FA] focus:outline-none focus:ring-2 focus:ring-[#E6E6FA]/60"
                          placeholder="you@example.com"
                        />
                      </label>

                      <label htmlFor="consent-password" className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Password</span>
                        <input
                          id="consent-password"
                          type="password"
                          required
                          minLength={6}
                          autoComplete="current-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-transparent bg-[#2D2D2D] px-3 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#E6E6FA] focus:outline-none focus:ring-2 focus:ring-[#E6E6FA]/60"
                          placeholder="At least 6 characters"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={Boolean(busy)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E6E6FA] px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                      >
                        {busy === 'signin' && <Spinner />}
                        {busy === 'signin' ? 'Signing in…' : 'Sign In with Email'}
                      </button>

                      <div className="pt-1 text-center">
                        <button
                          type="button"
                          onClick={signUp}
                          disabled={Boolean(busy)}
                          className="text-xs font-semibold text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
                        >
                          {busy === 'signup' ? 'Creating…' : "Don't have an account? Sign Up"}
                        </button>
                      </div>
                    </form>
                  </div>
                )
              ) : details ? (
                <div className="mt-5 space-y-4">
                  <LocationRow
                    location={location}
                    busy={locationBusy}
                    disabled={Boolean(busy)}
                    onShare={() => setLocationSheetOpen(true)}
                    onRemove={handleRemoveLocation}
                  />

                  {locationNote && <Alert tone="success">{locationNote}</Alert>}

                  <div className="rounded-xl bg-[#2D2D2D] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Requested by</p>
                    <p className="mt-1 text-base font-bold text-white">
                      {details.client?.name || 'An AI assistant'}
                    </p>
                    {redirectHost && <p className="mt-1 text-xs text-neutral-400">Returns to {redirectHost}</p>}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">This will let it</p>
                    <ul className="mt-2 space-y-2.5">
                      {PERMISSIONS.map((permission) => (
                        <li key={permission.icon} className="flex items-start gap-3">
                          <span className="material-symbols-outlined mt-px text-lg leading-none text-[#E6E6FA]">
                            {permission.icon}
                          </span>
                          <span className="text-sm leading-snug text-neutral-300">{permission.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-neutral-800 p-3">
                    <p className="truncate text-xs text-neutral-500">
                      Signed in as <span className="text-neutral-300">{signedInEmail}</span>
                    </p>
                    <button
                      type="button"
                      onClick={switchAccount}
                      disabled={Boolean(busy)}
                      className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-[#E6E6FA] hover:underline disabled:opacity-50"
                    >
                      {busy === 'switch' && <Spinner className="h-3 w-3" />}
                      Use a different account
                    </button>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => decide(false)}
                      disabled={Boolean(busy)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-transparent px-4 py-3 text-sm font-bold text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {busy === 'deny' && <Spinner />}
                      {busy === 'deny' ? 'Denying…' : 'Deny'}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(true)}
                      disabled={Boolean(busy)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E6E6FA] px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                    >
                      {busy === 'approve' && <Spinner />}
                      {busy === 'approve' ? 'Approving…' : 'Approve'}
                    </button>
                  </div>

                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    Your location stays in your Dukaan account and is used only to find shops. It is not shared with
                    this assistant beyond that lookup, and you can update or remove it above at any time. Cash on
                    delivery in this beta.
                  </p>
                </div>
              ) : error ? (
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setReloadKey((key) => key + 1)}
                    className="w-full rounded-xl bg-[#E6E6FA] px-4 py-3 text-sm font-bold text-black hover:opacity-90"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={switchAccount}
                    disabled={Boolean(busy)}
                    className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Use a different account
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#2D2D2D] p-4 text-sm text-neutral-300">
                  <Spinner className="text-[#E6E6FA]" /> Loading the request…
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-600">
          Secure sign-in by Dukaan.AI. The assistant only sees what you approve here.
        </p>
      </section>

      {/* The same sheet the shopkeeper sees at onboarding, with customer copy. */}
      <LocationModal
        isOpen={locationSheetOpen}
        mode="onboarding"
        audience="customer"
        onCaptured={handleLocationCaptured}
        onSetupLater={skipLocation}
      />
    </main>
  );
};

export default OAuthConsentScreen;
