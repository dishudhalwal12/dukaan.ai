import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Values come from .env (see .env.example). Placeholders keep createClient()
// constructible when Supabase is not configured; every caller guards against
// that case with isSupabaseConfigured(), so the app falls back to local-only
// guest mode instead of touching the network.
const PLACEHOLDER_SUPABASE_URL = 'https://placeholder-project.supabase.co';
const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder-anon-key';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PLACEHOLDER_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PLACEHOLDER_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    supabaseUrl !== PLACEHOLDER_SUPABASE_URL &&
    supabaseAnonKey !== PLACEHOLDER_SUPABASE_ANON_KEY
  );
};

// Initialize Supabase Client with persistent local storage and PKCE flow for reliable OAuth token retention
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'dukan_supabase_auth_token',
    flowType: 'pkce',
  },
});
