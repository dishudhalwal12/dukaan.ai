/**
 * Pure helpers for the `email-confirmation-status` Edge Function.
 *
 * Deliberately free of Deno and Supabase APIs so the same code can be imported
 * and tested under plain node — the same split `capture-session` uses.
 *
 * The question this function answers is unauthenticated by necessity: the whole
 * point is that a device waiting on a confirmation has no session yet. What
 * keeps it from being an email oracle is that the answer carries one bit and
 * nothing else — never the user id, never a timestamp — and that a malformed
 * address is rejected before any lookup happens.
 */

/** One casing and one trim, so the lookup matches `auth.users.email`. */
export const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/**
 * A shape check, not a deliverability check. Its job is to keep junk out of the
 * database call, so it stays deliberately loose about the local part and firm
 * about the structure: exactly one `@`, a dotted domain with no empty labels.
 */
export const isLikelyEmail = (value: unknown): boolean => {
  const email = normalizeEmail(value);
  if (email.length < 5 || email.length > 254) return false;
  if (/\s/.test(email)) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;

  return true;
};

/** The RPC returns a boolean; anything else is not a confirmation. */
export const parseConfirmedFlag = (data: unknown): boolean => data === true;