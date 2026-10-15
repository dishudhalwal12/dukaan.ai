import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { markFreshSignIn } from '../utils/authOutcome.ts';

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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.warn('Supabase Auth Error (SignUp):', error.message);
      return { user: null, error: error.message };
    }

    if (data.user) {
      localStorage.setItem('dukan-auth-user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
      }));
      localStorage.removeItem('dukan-guest-mode');
    }

    // A session means the signup signed the user in; without one the project
    // requires email confirmation first.
    if (data.session) markFreshSignIn();

    return { user: data.user, error: null, session: data.session };
  } catch (error: any) {
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.warn('Supabase Auth Error (SignIn):', error.message);
      return { user: null, error: error.message };
    }

    if (data.user) {
      localStorage.setItem('dukan-auth-user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
      }));
      localStorage.removeItem('dukan-guest-mode');
    }

    if (data.session) markFreshSignIn();

    return { user: data.user, error: null, session: data.session };
  } catch (error: any) {
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
      if (hasCode || hasHash) {
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
