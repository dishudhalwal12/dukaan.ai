import type { Customer, OrderItem } from '../types.ts';

/**
 * Pure row builders for the cloud writers.
 *
 * They live outside `cloudSync.ts` so the mapping can be tested without a browser,
 * a Supabase client or a network: given the session user or the order, these say
 * exactly which columns get written and nothing else.
 */

/** The part of an auth user this app mirrors into `business_profiles`. */
export interface AuthUserLike {
  email?: string | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, any> | null;
  app_metadata?: Record<string, any> | null;
}

export interface OwnerColumns {
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  google_picture_url: string | null;
  auth_provider: string | null;
  preferred_language: string | null;
}

/** One `user_identities` row: the account identity, provider-independent. */
export interface IdentityRow {
  email: string | null;
  email_verified: boolean | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string | null;
  preferred_language: string | null;
  signup_at: string | null;
}

export interface OrderRow {
  external_id: string;
  user_id: string | null;
  customer: Customer | Record<string, never>;
  items: OrderItem[];
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  updated_at: string;
  customer_phone: string | null;
  customer_name: string | null;
  delivery_address: string | null;
  notes: string | null;
}

const str = (value: unknown): string | null => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
};

/**
 * The owner identity columns, mirrored from the auth session so the shop reads
 * without joining `auth.users` (and so the dashboard can show who owns it).
 *
 * Returns {} when there is no session to read: a caller must never blank a column
 * it merely does not know, and an email sign-up has no name or picture to mirror.
 */
export const ownerColumnsFromAuthUser = (user?: AuthUserLike | null): Partial<OwnerColumns> => {
  if (!user) return {};

  const md = user.user_metadata || {};
  const app = user.app_metadata || {};

  const fullName = str(md.full_name) || str(md.name);
  const parts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];

  return {
    owner_first_name: parts[0] || null,
    // A single word is a whole name, not a first name with an empty last name.
    owner_last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    // The email lives on the auth user itself, never in `user_metadata`, so it
    // has to be read here or it is lost for every provider.
    owner_email: str(user.email),
    // Google sends `picture`; other providers (and some Google accounts) send
    // `avatar_url`. Either way it is the owner's picture.
    google_picture_url: str(md.picture) || str(md.avatar_url),
    auth_provider: str(app.provider),
    preferred_language: str(md.locale),
  };
};

/**
 * The `user_identities` row for an auth session.
 *
 * Email/name/picture/provider, captured for EVERY provider. An email/password
 * signup carries empty `user_metadata`, so a name simply stays null rather than
 * being invented from the email local-part. Returns {} with no session: a caller
 * must never write a row it has no identity for.
 */
export const identityRowFromAuthUser = (user?: AuthUserLike | null): Partial<IdentityRow> => {
  if (!user) return {};

  const md = user.user_metadata || {};
  const app = user.app_metadata || {};

  const fullName = str(md.full_name) || str(md.name);
  const parts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
  const confirmed = user.email_confirmed_at;

  return {
    email: str(user.email),
    // null when the field is absent, never false — do not assert a fact we lack
    email_verified: typeof confirmed === 'string' ? confirmed.length > 0 : null,
    owner_first_name: parts[0] || null,
    owner_last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    display_name: fullName || null,
    avatar_url: str(md.picture) || str(md.avatar_url),
    auth_provider: str(app.provider),
    preferred_language: str(md.locale),
    // The upsert inserts when the trigger has not seeded the row yet; signup_at
    // is NOT NULL, so the insert has to carry the account's own creation time.
    signup_at: str(user.created_at),
  };
};

/**
 * One `orders` row. The `customer` JSONB stays the source of truth for the app's
 * order modal; the flat columns beside it are what a dashboard reads without
 * digging into JSON, and they were NULL because only the JSONB was written.
 */
export const orderRowFromOrder = (
  order: any,
  userId: string | null,
  updatedAt: string
): OrderRow => {
  const customer = order?.customer || {};

  return {
    external_id: order?.id,
    user_id: userId,
    customer,
    items: Array.isArray(order?.items) ? order.items : [],
    total: Number(order?.total) || 0,
    payment_method: order?.paymentMethod,
    status: order?.status,
    created_at: order?.timestamp,
    updated_at: updatedAt,
    customer_phone: str(customer.whatsappNumber) || str(customer.phone),
    customer_name: str(customer.name),
    delivery_address: str(customer.address),
    notes: str(order?.notes),
  };
};

/** The columns written beside the JSONB, which an older deployed table may lack. */
const OPTIONAL_ORDER_COLUMNS = ['customer_phone', 'customer_name', 'delivery_address', 'notes'] as const;

type OptionalOrderColumn = (typeof OPTIONAL_ORDER_COLUMNS)[number];

/**
 * True only when PostgREST reported that one of the optional columns does not
 * exist — `PGRST204`, or the "schema cache" message. Any other error is a real
 * failure and must surface rather than trigger a silent retry.
 */
export const isMissingOptionalColumnError = (error: unknown): boolean => {
  const { code, message } = (error || {}) as { code?: unknown; message?: unknown };
  return code === 'PGRST204' || (typeof message === 'string' && message.includes('schema cache'));
};

/** The same rows with the optional columns removed, for a base-only `orders` table. */
export const stripOptionalOrderColumns = <T extends object>(rows: T[]): Omit<T, OptionalOrderColumn>[] =>
  (Array.isArray(rows) ? rows : []).map((row) => {
    const { customer_phone, customer_name, delivery_address, notes, ...base } = row as Record<string, unknown>;
    return base as Omit<T, OptionalOrderColumn>;
  });
