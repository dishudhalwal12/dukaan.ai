import type { User, EmailOtpType } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { clearFreshSignIn, markFreshSignIn } from '../utils/authOutcome.ts';
import { CONFIRM_TYPES, parseConfirmationStatus } from '../utils/confirmLink.ts';

export type { User };

export interface AuthResult {
  user: User | null;
  /** Null when the project requires email confirmation \u2014 the account exists but is not signed in. */
  session?: unknown | null;
  error?: string | null;
}

/**
 * Initiates Google OAuth sign-in via Supabase.
 * In a browser, this redirects to Google consent and returns to the current URL.
 */
export const signInWithGoogle = async (): Promise<AuthResult> => {
  try {
    if (!isSupabaseConfigured()) {
      return {
        user: null,
        error: 'Supabase credentials are not configured in your environment. You can continue as Guest.',
      };
    }

    // Set flag so App knows an OAuth redirect is underway and won't pop up the modal prematurely
    localStorage.setItem('dukan-oauth-in-progress', 'true');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      localStorage.removeItem('dukan-oauth-in-progress');
      console.warn('Supabase Google Auth Error:', error.message);
      return { user: null, error: error.message };
    }

    return { user: null, error: null };
  } catch (error: any) {
    localStorage.removeItem('dukan-oauth-in-progress');
    console.warn('Supabase Google Auth Exception:', error);
    return { user: null, error: error?.message || 'Failed to initiate Google authentication.' };
  }
};

/**
 * Sign up a new user with email and password via Supabase Auth.
 */
export const signUpWithEmail = async (
  email: string, 
  password: string
): Promise<AuthResult> => {
  try {
    if (!isSupabaseConfigured()) {
      return {
        user: null,
        error: 'Supabase credentials are not configured in your environment. You can continue as Guest.',
      };
    }

    // Marked before the request goes out: supabase-js notifies auth listeners
    // before the sign-in promise resolves, so marking afterwards can be too
    // late — and leaves the marker behind for a later reload to consume.
    markFreshSignIn();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error) {
      console.warn('Supabase Auth Error (SignUp):', error.message);
      clearFreshSignIn();
      return { user: null, error: error.message };
    }

    // Supabase anti-enumeration protection: if user already exists, Supabase returns
    // a dummy user with an empty identities array [] and null session, sending NO email.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      clearFreshSignIn();
      return {
        user: null,
        session: null,
        error: 'An account with this email already exists. Please sign in or use Continue with Google.',
      };
    }

    // Only a session means the user is actually signed in. Without one the
    // project requires email confirmation, and caching an identity here would
    // make the app believe it is authenticated with no way to act.
    if (data.session) {
      if (data.user) {
        localStorage.setItem('dukan-auth-user', JSON.stringify({
          id: data.user.id,
          email: data.user.email,
        }));
        localStorage.removeItem('dukan-guest-mode');
      }
    } else {
      clearFreshSignIn();
    }

    return { user: data.user, error: null, session: data.session };
  } catch (error: any) {
    clearFreshSignIn();
    console.warn('Supabase Auth Exception (SignUp):', error);
    return { user: null, error: error?.message || 'An unexpected error occurred during sign up.' };
  }
};

/**
 * Sign in an existing user with email and password via Supabase Auth.
 */
export const signInWithEmail = async (
  email: string, 
  password: string
): Promise<AuthResult> => {
  try {
    if (!isSupabaseConfigured()) {
      return {
        user: null,
        error: 'Supabase credentials are not configured in your environment. You can continue as Guest.',
      };
    }

    markFreshSignIn();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.warn('Supabase Auth Error (SignIn):', error.message);
      clearFreshSignIn();
      return { user: null, error: error.message };
    }

    if (data.session) {
      if (data.user) {
        localStorage.setItem('dukan-auth-user', JSON.stringify({
          id: data.user.id,
          email: data.user.email,
        }));
        localStorage.removeItem('dukan-guest-mode');
      }
    } else {
      clearFreshSignIn();
    }

    return { user: data.user, error: null, session: data.session };
  } catch (error: any) {
    clearFreshSignIn();
    console.warn('Supabase Auth Exception (SignIn):', error);
    return { user: null, error: error?.message || 'An unexpected error occurred during sign in.' };
  }
};

/**
 * Sign out the currently authenticated user.
 */
export const signOutUser = async (): Promise<boolean> => {
  try {
    localStorage.removeItem('dukan-auth-user');
    localStorage.removeItem('dukan-oauth-in-progress');

    if (!isSupabaseConfigured()) {
      return true;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Supabase Auth Error (SignOut):', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase Auth Exception (SignOut):', error);
    return false;
  }
};

/**
 * Get current authenticated user session if present.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    if (!isSupabaseConfigured()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
};

/**
 * Listen to auth state changes in Supabase and notify callbacks.
 * Automatically cleans OAuth query/hash tokens from URL and caches active user.
 */
export const listenToAuthState = (callback: (user: User | null) => void): (() => void) => {
  try {
    if (!isSupabaseConfigured()) {
      callback(null);
      return () => {};
    }

    const cleanOAuthUrl = () => {
      const hasCode = window.location.search.includes('code=');
      const hasHash = window.location.hash.includes('access_token=');
      const hasError = window.location.search.includes('error=') || window.location.hash.includes('error=');
      if (hasCode || hasHash || hasError) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    };

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        localStorage.setItem('dukan-auth-user', JSON.stringify({
          id: session.user.id,
          email: session.user.email,
        }));
        localStorage.removeItem('dukan-guest-mode');
        localStorage.removeItem('dukan-oauth-in-progress');
        cleanOAuthUrl();
        callback(session.user);
      } else {
        // If no active session and not in the middle of OAuth redirect, notify null
        const isOAuth = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
        if (!isOAuth) {
          localStorage.removeItem('dukan-auth-user');
          callback(null);
        }
      }
    }).catch(() => {
      callback(null);
    });

    // 2. Realtime auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Supabase Auth Event:', event, session?.user?.email);

      if (session?.user) {
        localStorage.setItem('dukan-auth-user', JSON.stringify({
          id: session.user.id,
          email: session.user.email,
        }));
        localStorage.removeItem('dukan-guest-mode');
        localStorage.removeItem('dukan-oauth-in-progress');
        cleanOAuthUrl();
        callback(session.user);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('dukan-auth-user');
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  } catch (error) {
    console.warn('Supabase Auth Error (Listen):', error);
    return () => {};
  }
};

/**
 * Resends the signup confirmation email for a pending user account.
 */
export const resendConfirmationEmail = async (
  email: string
): Promise<{ success: boolean; error?: string | null }> => {
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Supabase credentials are not configured in your environment.',
      };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error) {
      console.warn('Supabase Auth Resend Error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.warn('Supabase Auth Resend Exception:', error);
    return { success: false, error: error?.message || 'Failed to resend confirmation email.' };
  }
};

/**
 * Verifies an email-confirmation link, whichever browser or device opened it.
 *
 * The email points at our own route with `token_hash`, and `verifyOtp` needs no
 * PKCE `code_verifier` for it — unlike the default ConfirmationURL, whose
 * verifier lives in the browser that STARTED the signup. That is the whole
 * reason a link tapped inside Gmail's in-app webview (or on another device) can
 * complete here.
 *
 * A link type this app does not own (recovery, invite) is refused by name rather
 * than handed to Supabase, so a recovery link can never be spent as a signup
 * confirmation.
 */
export const confirmEmail = async (
  tokenHash: string,
  type: string
): Promise<{ user: User | null; error: string | null }> => {
  if (!(CONFIRM_TYPES as readonly string[]).includes(type)) {
    return {
      user: null,
      error: `This is a "${type || 'unknown'}" link, which this app does not handle.`,
    };
  }

  if (!tokenHash) {
    return { user: null, error: 'This confirmation link is missing its token.' };
  }

  try {
    if (!isSupabaseConfigured()) {
      return {
        user: null,
        error: 'Supabase credentials are not configured in your environment. You can continue as Guest.',
      };
    }

    const { data, error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });

    if (error) {
      console.warn('Supabase Auth Error (ConfirmEmail):', error.message);
      return { user: null, error: error.message };
    }

    // The link landed here, so this browser now holds the session. Caching the
    // identity lets the shell pick the sign-in up without another round trip.
    if (data.user) {
      localStorage.setItem('dukan-auth-user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
      }));
      localStorage.removeItem('dukan-guest-mode');
    }

    return { user: data.user, error: null };
  } catch (error: any) {
    console.warn('Supabase Auth Exception (ConfirmEmail):', error);
    return { user: null, error: error?.message || 'Failed to confirm this email link.' };
  }
};

/**
 * Whether the account for `email` has confirmed, asked of the server rather than
 * of local storage.
 *
 * This is what makes a confirmation on one device visible on another: the
 * session the link created lives only in the browser that opened it, so a device
 * still waiting has to ask. A failure to ask is reported as "not confirmed yet"
 * and simply polled again — it is never surfaced as an error.
 */
export const getEmailConfirmationStatus = async (email: string): Promise<boolean> => {
  try {
    if (!isSupabaseConfigured()) return false;
    if (!email || !email.trim()) return false;

    const { data, error } = await supabase.functions.invoke('email-confirmation-status', {
      body: { email: email.trim().toLowerCase() },
    });

    if (error) {
      console.warn('Supabase Status Error (email-confirmation-status):', error.message);
      return false;
    }

    return parseConfirmationStatus(data);
  } catch (error) {
    console.warn('Failed to read the email confirmation status.', error);
    return false;
  }
};

/**
 * Reads any error parameters left in the URL hash or query string after an auth callback (e.g. expired link).
 */
export const getAuthUrlError = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    const searchParams = new URLSearchParams(window.location.search);
    const hashString = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hashString);

    const errorDesc = searchParams.get('error_description') || hashParams.get('error_description');
    if (errorDesc) {
      return decodeURIComponent(errorDesc.replace(/\+/g, ' '));
    }
    const errorMsg = searchParams.get('error') || hashParams.get('error');
    if (errorMsg) {
      return decodeURIComponent(errorMsg.replace(/\+/g, ' '));
    }
    return null;
  } catch {
    return null;
  }
};
