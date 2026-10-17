/**
 * The name to greet a returning user with.
 *
 * Onboarding asks "What should we call you?" and stores the answer on the
 * device; it is also mirrored into the cloud profile so the greeting survives a
 * device change. Resolution order: this device → cloud profile → Google account
 * → email prefix → a neutral fallback.
 */

export const PROFILE_NAME_KEY = 'dukan-profile-name';

export interface GreetingNameSources {
  localName?: string | null;
  cloudName?: string | null;
  user?: {
    user_metadata?: Record<string, any> | null;
    email?: string | null;
  } | null;
}

export const resolveGreetingName = ({ localName, cloudName, user }: GreetingNameSources): string => {
  const metadata = user?.user_metadata ?? null;

  const candidates = [
    localName,
    cloudName,
    metadata?.full_name,
    metadata?.name,
    typeof user?.email === 'string' ? user.email.split('@')[0] : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return 'there';
};
