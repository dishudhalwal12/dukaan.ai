import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { resolveApiUrl, buildAuthHeaders } from './apiClient.ts';

/**
 * Authenticated access to the bot's API.
 *
 * The bot sits on a public tunnel and refuses any /api call without a Supabase
 * access token, so every module that talks to it goes through here rather than
 * each inventing its own headers.
 */

export const apiUrl = (endpoint: string): string => {
  const base = import.meta.env?.VITE_API_BASE as string | undefined;
  return resolveApiUrl(base, endpoint, typeof window !== 'undefined' ? window.location : null);
};

/**
 * The current Supabase access token, or null when there is no session.
 *
 * No session means no Authorization header: the server then refuses, and the UI
 * shows a disconnected state rather than quietly serving local or stale data.
 */
export const getAuthToken = async (): Promise<string | null> => {
  try {
    if (!isSupabaseConfigured()) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
};

export const authHeaders = async (extra: Record<string, string> = {}): Promise<Record<string, string>> =>
  buildAuthHeaders(await getAuthToken(), extra);
