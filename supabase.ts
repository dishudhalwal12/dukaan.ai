import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve environment variables with project fallbacks
const DEFAULT_SUPABASE_URL = 'https://glkzpygjodhnmtlxejzg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsa3pweWdqb2Robm10bHhlanpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODk0MTEsImV4cCI6MjEwNzU2NTQxMX0.GqqPCk9O-LP48Cpzd9Ee8HlXAS6zxHPL6bFlF8lh73U';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    supabaseUrl !== 'https://placeholder-project.supabase.co' &&
    supabaseAnonKey !== 'placeholder-anon-key'
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
