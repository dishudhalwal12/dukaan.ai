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
  user_metadata?: Record<string, any> | null;
  app_metadata?: Record<string, any> | null;
}

export interface OwnerColumns {
  owner_first_name: string | null;
  owner_last_name: string | null;
  google_picture_url: string | null;
  auth_provider: string | null;
  preferred_language: string | null;
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
    // Google sends `picture`; other providers (and some Google accounts) send
    // `avatar_url`. Either way it is the owner's picture.
    google_picture_url: str(md.picture) || str(md.avatar_url),
    auth_provider: str(app.provider),
    preferred_language: str(md.locale),
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
