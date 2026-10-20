import type { User } from '@supabase/supabase-js';

const DEFAULT_AVATAR = '/logo.png';

/**
 * Which photo to show for an account.
 *
 * Order: a photo the shopkeeper uploaded, then the Google account photo, then
 * the Dukaan logo. Email/password accounts have no provider photo, so without
 * the logo they fell back to a generic person glyph.
 */
export function resolveProfileImage(user?: User | null, uploaded?: string | null): string {
  const chosen = String(uploaded || '').trim();
  if (chosen) return chosen;

  const providers = [
    user?.app_metadata?.provider,
    ...(Array.isArray(user?.identities) ? user.identities.map((identity) => identity.provider) : []),
  ].map((provider) => String(provider || '').toLowerCase());

  if (providers.includes('google')) {
    const metadata = user?.user_metadata || {};
    const googlePhoto = String(metadata.avatar_url || metadata.picture || '').trim();
    if (googlePhoto) return googlePhoto;
  }

  return DEFAULT_AVATAR;
}
