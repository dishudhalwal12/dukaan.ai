import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { isMcpOrderId } from '../utils/orderOwnership.ts';
import type { Product, Order } from '../types.ts';
import type { User } from './auth.ts';
import { isSignupAfterCutoff } from '../utils/walkthroughGate.js';
import { staleExternalIds } from '../utils/catalogSync.js';
import { collectDeviceSession, noteSyncError } from '../utils/telemetry.ts';
import { getStoredStoreLocation, type StoreLocation } from '../utils/location.ts';
import {
  ownerColumnsFromAuthUser,
  identityRowFromAuthUser,
  orderRowFromOrder,
  isMissingOptionalColumnError,
  stripOptionalOrderColumns,
} from '../utils/cloudRows.ts';

/**
 * Helper to resolve the active user ID from explicit argument or confirmed Supabase session.
 * Unauthenticated localStorage entries are never trusted as proof of an identity.
 */
export const resolveActiveUserId = async (explicitUserId?: string): Promise<string | null> => {
  if (explicitUserId) return explicitUserId;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  } catch (e) {
    // Ignore error
  }

  return null;
};

// NOTE: `claimUnassignedRecords` was removed deliberately. It ran an unscoped
// `UPDATE ... WHERE user_id IS NULL` on products and orders, so the first
// account to sign in absorbed every unowned row in the whole database. Guest
// sessions no longer write to Supabase at all, so there is nothing to claim.

/** The signed-in auth user, metadata included. Null for a cached/guest session. */
const currentAuthUser = async (): Promise<User | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch (e) {
    return null;
  }
};

/**
 * Drop null/undefined values so an upsert can never blank a column that already
 * holds a real value (an older session with empty metadata, say).
 */
const nonNullColumns = (columns: Record<string, unknown>): Record<string, unknown> => {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(columns)) {
    if (value !== null && value !== undefined) kept[key] = value;
  }
  return kept;
};

/**
 * Decides whether this session belongs to a signup that happened after the
 * walkthrough rollout. Reads `user_identities.signup_at`, which the signup
 * trigger seeds for email and Google accounts alike. Guests, missing sessions,
 * and failed lookups all fail closed: better to skip the tour than show it to
 * an existing store.
 */
export const isNewSignupForWalkthrough = async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;

  const user = await currentAuthUser();
  if (!user) return false;

  let signupAt: string | null | undefined = user.created_at;

  try {
    const { data, error } = await supabase
      .from('user_identities')
      .select('signup_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return false;
    signupAt = data?.signup_at ?? user.created_at;
  } catch {
    return false;
  }

  return isSignupAfterCutoff(signupAt);
};

/**
 * Safely saves the business profile to Supabase database without blocking the UI.
 * Associates record with user_id if user is logged in or cached.
 */
export const saveBusinessProfileToCloud = async (
  storeName: string,
  profileData?: any,
  explicitUserId?: string,
  onboarding?: any
): Promise<void> => {
  try {
    if (!storeName) return;
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured. Business profile stored locally.');
      return;
    }

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — an ownerless profile row
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    const effectiveProfile = profileData || {
      storeDetails: {
        storeName,
        category: localStorage.getItem('dukan-store-category') ?? 'Kirana / General Store',
      },
      ownerName: localStorage.getItem('dukan-profile-name') || undefined,
      preferredLanguage: localStorage.getItem('dukan-language') || 'en',
    };

    // The store's position is its own fact, not part of the profile blob: it is
    // what a new device restores to answer "where is this shop?" without asking
    // the shopkeeper to stand in it again.
    const storeLocation = getStoredStoreLocation();

    const localName = typeof localStorage !== 'undefined' ? localStorage.getItem('dukan-profile-name') : null;
    const authOwnerCols = ownerColumnsFromAuthUser(await currentAuthUser());
    if (!authOwnerCols.owner_first_name && localName) {
      const parts = localName.trim().split(/\s+/).filter(Boolean);
      authOwnerCols.owner_first_name = parts[0] || 'Store';
      authOwnerCols.owner_last_name = parts.length > 1 ? parts.slice(1).join(' ') : 'Owner';
    }

    const { error } = await supabase
      .from('business_profiles')
      .upsert({
        user_id: userId,
        store_name: storeName,
        category: effectiveProfile?.storeDetails?.category ?? localStorage.getItem('dukan-store-category') ?? 'Kirana / General Store',
        profile_data: effectiveProfile,
        onboarding: onboarding ?? {},
        // Owner identity, mirrored from the auth session: first/last name, picture,
        // provider and language. Without this the dashboard has only the raw
        // profile_data blob and these columns stay NULL.
        ...nonNullColumns(authOwnerCols),
        preferred_language: localStorage.getItem('dukan-language') || effectiveProfile?.preferredLanguage || 'en',
        ...(storeLocation ? {
          store_lat: storeLocation.lat,
          store_lng: storeLocation.lng,
          store_location_accuracy_m: storeLocation.accuracy_m,
          store_location_source: storeLocation.source,
          store_location_captured_at: storeLocation.captured_at,
        } : {}),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      console.warn('Supabase DB Error (saveBusinessProfileToCloud):', error.message);
    } else {
      console.log(`Business profile saved in Supabase for user: ${userId}`);
      void saveMerchantPreferencesToCloud();
    }
  } catch (error) {
    console.warn('Failed to sync profile to Supabase cloud. Continuing with local data.', error);
  }
};

/**
 * Direct cloud writer for language preference changes.
 *
 * Synchronizes the chosen language to business_profiles, merchant_preferences,
 * and user_identities so it survives across sessions, devices, and reloads.
 */
export const saveLanguagePreferenceToCloud = async (
  lang: string,
  explicitUserId?: string,
): Promise<void> => {
  try {
    if (!isSupabaseConfigured() || !lang) return;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) {
      console.warn('Cannot sync language to cloud: no authenticated user.');
      return;
    }

    // 1. Update or upsert business_profiles. Language is chosen before the
    // store name in onboarding, so at that point there is no profile row yet —
    // an upsert would create a placeholder store that marks onboarding done.
    const storeName = localStorage.getItem('dukan-store-name');
    const profilePatch = {
      preferred_language: lang,
      updated_at: new Date().toISOString(),
    };
    const { error: bpError } = storeName
      ? await supabase
          .from('business_profiles')
          .upsert(
            { user_id: userId, store_name: storeName, ...profilePatch },
            { onConflict: 'user_id' }
          )
      : await supabase
          .from('business_profiles')
          .update(profilePatch)
          .eq('user_id', userId);

    if (bpError) {
      console.warn('Supabase DB Error (saveLanguagePreferenceToCloud - business_profiles):', bpError.message);
    } else {
      console.log(`Updated business_profiles preferred_language to '${lang}' for user: ${userId}`);
    }

    // 2. Upsert merchant_preferences
    const { error: prefError } = await supabase
      .from('merchant_preferences')
      .upsert(
        {
          user_id: userId,
          preferred_language: lang,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (prefError) {
      console.warn('Supabase DB Error (saveLanguagePreferenceToCloud - merchant_preferences):', prefError.message);
    }

    // 3. Update user_identities
    const { error: idError } = await supabase
      .from('user_identities')
      .update({
        preferred_language: lang,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (idError) {
      console.warn('Supabase DB Error (saveLanguagePreferenceToCloud - user_identities):', idError.message);
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save preferred language to Supabase.', error);
  }
};

/**
 * Direct cloud writer for supplier details.
 *
 * Synchronizes supplier details into `public.suppliers`.
 */
export const saveSupplierToCloud = async (
  name: string,
  whatsapp: string,
  notes?: string,
  explicitUserId?: string,
): Promise<void> => {
  try {
    if (!isSupabaseConfigured() || !name) return;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) return;

    // Check if supplier row exists for this user
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('suppliers')
        .update({
          supplier_name: name,
          supplier_whatsapp: whatsapp,
          notes: notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);

      if (error) {
        console.warn('Supabase DB Error (saveSupplierToCloud - update):', error.message);
      }
    } else {
      const { error } = await supabase
        .from('suppliers')
        .insert({
          user_id: userId,
          supplier_name: name,
          supplier_whatsapp: whatsapp,
          notes: notes ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.warn('Supabase DB Error (saveSupplierToCloud - insert):', error.message);
      }
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save supplier to Supabase.', error);
  }
};

/**
 * Safely fetches a business profile from Supabase database for the active user.
 */
export const fetchBusinessProfileFromCloud = async (storeName?: string): Promise<any | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId();

    if (userId) {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('profile_data, store_name, category, onboarding, preferred_language, store_lat, store_lng, store_location_accuracy_m, store_location_source, store_location_captured_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.profile_data) {
        if (data.preferred_language) {
          localStorage.setItem('dukan-language', data.preferred_language);
        }
        // Merge the dynamic onboarding payload alongside the profile body so
        // callers can restore the AI Q&A, not just the raw answers.
        return {
          ...data.profile_data,
          category: data.category,
          onboarding: data.onboarding,
          // Exposed on the profile so callers that already have this round trip
          // can adopt the account's language without a second query — and so a
          // missing merchant_preferences row falls back to the profile column.
          preferredLanguage: data.preferred_language ?? data.profile_data.preferredLanguage ?? null,
          // Absent when the shop has not set a position yet; the catalog gate
          // then asks for one on this device.
          storeLocation: typeof data.store_lat === 'number' && typeof data.store_lng === 'number'
            ? {
                lat: data.store_lat,
                lng: data.store_lng,
                accuracy_m: data.store_location_accuracy_m ?? null,
                source: data.store_location_source ?? 'gps',
                captured_at: data.store_location_captured_at ?? new Date().toISOString(),
              }
            : null,
        };
      }
    }

    // No storeName/id fallback: `business_profiles.id` is no longer the
    // slugified store name (that made two shops with the same name share one
    // row), so a profile is only ever resolved by its owner.
    return null;
  } catch (error) {
    console.warn('Failed to fetch profile from Supabase cloud.', error);
    return null;
  }
};

/**
 * Syncs the product catalog to Supabase database for the logged-in user or store.
 */
export const syncProductsToCloud = async (
  products: Product[],
  explicitUserId?: string
): Promise<void> => {
  try {
    if (!products || products.length === 0) return;
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — rows without an owner
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    const rows = products.map(product => ({
      external_id: product.id,
      user_id: userId,
      name: product.name,
      price: product.price,
      stock: product.stock,
      stock_unit: product.stockUnit,
      image_url: product.imageUrl,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'user_id,external_id' });

    if (error) {
      console.warn('Supabase DB Error (syncProductsToCloud):', error.message);
    } else {
      console.log(`Synced ${products.length} products to Supabase for user: ${userId || 'guest'}`);

      // The bot reads this table directly, so a product removed in the app has
      // to be removed here too — an upsert alone would leave it orderable.
      const { data: existingRows, error: readError } = await supabase
        .from('products')
        .select('external_id')
        .eq('user_id', userId);

      if (readError) {
        console.warn('Supabase DB Error (catalog mirror read):', readError.message);
      } else {
        const stale = staleExternalIds(existingRows, products);
        if (stale.length > 0) {
          const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .eq('user_id', userId)
            .in('external_id', stale);
          if (deleteError) {
            console.warn('Supabase DB Error (catalog mirror delete):', deleteError.message);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to sync products to Supabase database.', error);
  }
};

/**
 * Deletes a product from the Supabase database.
 */
export const deleteProductFromCloud = async (productId: string): Promise<void> => {
  try {
    if (!productId || !isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId();
    if (!userId) return;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('user_id', userId)
      .eq('external_id', productId);

    if (error) {
      console.warn('Supabase DB Error (deleteProductFromCloud):', error.message);
    } else {
      console.log('Successfully deleted product from Supabase cloud:', productId);
    }
  } catch (error) {
    console.warn('Failed to delete product from Supabase database.', error);
  }
};

/**
 * Fetches products from Supabase database for the active user.
 */
export const fetchProductsFromCloud = async (): Promise<Product[] | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('Supabase DB Error (fetchProductsFromCloud):', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map((item: any) => ({
      id: item.external_id,
      name: item.name,
      price: item.price,
      stock: item.stock,
      stockUnit: item.stock_unit,
      imageUrl: item.image_url
    }));
  } catch (error) {
    console.warn('Failed to fetch products from Supabase database.', error);
    return null;
  }
};

/**
 * Syncs orders to Supabase database for the logged-in user.
 */
export const syncOrdersToCloud = async (
  orders: Order[],
  explicitUserId?: string
): Promise<void> => {
  try {
    // MCP orders are owned by the server. Writing a local, normalised copy back
    // would overwrite authoritative status/items/notes with stale display data.
    const writable = (Array.isArray(orders) ? orders : []).filter((order) => !isMcpOrderId(order?.id));
    if (writable.length === 0) return;
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — rows without an owner
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    // `orderRowFromOrder` adds the flat customer columns beside the JSONB, so a
    // dashboard reads a column instead of digging into JSON.
    const now = new Date().toISOString();
    const rows = writable.map(order => orderRowFromOrder(order, userId, now));

    let { error } = await supabase
      .from('orders')
      .upsert(rows, { onConflict: 'user_id,external_id' });

    // An older deployed table may carry only the JSONB and the base columns; the
    // optional flat columns then fail the whole upsert. Retry without them so the
    // order is still saved rather than dropped.
    if (isMissingOptionalColumnError(error)) {
      ({ error } = await supabase
        .from('orders')
        .upsert(stripOptionalOrderColumns(rows), { onConflict: 'user_id,external_id' }));
    }

    if (error) {
      console.warn('Supabase DB Error (syncOrdersToCloud):', error.message);
    } else {
      console.log(`Synced ${writable.length} orders to Supabase for user: ${userId || 'guest'}`);
    }
  } catch (error) {
    console.warn('Failed to sync orders to Supabase database.', error);
  }
};

/**
 * Fetches orders from Supabase database for the logged-in user.
 */
export const fetchOrdersFromCloud = async (limit = 200): Promise<Order[] | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 200, 500)));

    if (error) {
      console.warn('Supabase DB Error (fetchOrdersFromCloud):', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map((item: any) => ({
      id: item.external_id,
      customer: item.customer,
      items: item.items,
      total: Number(item.total),
      paymentMethod: item.payment_method,
      status: item.status,
      timestamp: item.created_at,
      // The dashboard's ownership filter drops rows without an explicit owner.
      // The cloud read is already scoped by RLS, but the client still verifies.
      userId: item.user_id,
      customerUserId: item.customer_user_id,
      channel: item.channel || 'whatsapp',
    }));
  } catch (error) {
    console.warn('Failed to fetch orders from Supabase database.', error);
    return null;
  }
};

/**
 * Updates the status of an order whose source of truth is Supabase.
 *
 * WhatsApp-era orders live in the bot's local engine; MCP orders go straight to
 * Supabase. The dashboard calls this only for `MCP-` ids (or as a fallback when
 * the backend says the order is unknown). It is scoped to the signed-in owner
 * and reports whether a row actually changed.
 */
export const updateOrderStatusInCloud = async (externalId: string, status: string, expectedStatus?: string): Promise<boolean> => {
  try {
    if (!isSupabaseConfigured() || !externalId || !status) return false;
    const userId = await resolveActiveUserId();
    if (!userId) return false;

    let query = supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('external_id', externalId);
    // Compare-and-set: a stale dashboard must not overwrite a customer's
    // cancellation or a status another tab already moved.
    if (expectedStatus) query = query.eq('status', expectedStatus);
    const { data, error } = await query.select('external_id').maybeSingle();

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (updateOrderStatusInCloud):', error.message);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    noteSyncError();
    console.warn('Failed to update the order in Supabase.', error);
    return false;
  }
};

/** The shop's AI-ordering switch, radius, and pause state. */
export interface McpSettings {
  mcpEnabled: boolean;
  deliveryRadiusKm: number;
  ordersPaused: boolean;
}

export const fetchMcpSettingsFromCloud = async (): Promise<McpSettings | null> => {
  try {
    if (!isSupabaseConfigured()) return null;
    const userId = await resolveActiveUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('business_profiles')
      .select('mcp_enabled, delivery_radius_km, orders_paused')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      mcpEnabled: Boolean(data.mcp_enabled),
      deliveryRadiusKm: Number(data.delivery_radius_km) || 5,
      ordersPaused: Boolean(data.orders_paused),
    };
  } catch {
    return null;
  }
};

export const saveMcpSettingsToCloud = async (settings: McpSettings): Promise<boolean> => {
  try {
    if (!isSupabaseConfigured()) return false;
    const userId = await resolveActiveUserId();
    if (!userId) return false;

    const radius = Math.min(10, Math.max(1, Number(settings.deliveryRadiusKm) || 5));
    const { data, error } = await supabase
      .from('business_profiles')
      .update({
        mcp_enabled: Boolean(settings.mcpEnabled),
        delivery_radius_km: radius,
        orders_paused: Boolean(settings.ordersPaused),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('user_id')
      .maybeSingle();

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (saveMcpSettingsToCloud):', error.message);
      return false;
    }
    // An update that matched no profile row reports no error; it also saved
    // nothing. Do not tell the merchant it worked.
    return Boolean(data);
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save AI-ordering settings.', error);
    return false;
  }
};

/**
 * Writes this app load's device session row.
 *
 * Guests write nothing: there is no account to attribute the row to.
 */
export const saveDeviceSessionToCloud = async (explicitUserId?: string): Promise<void> => {
  try {
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) return;

    const payload = await collectDeviceSession();

    // The Edge Function is the only writer that can see the caller's public IP,
    // and it performs the insert itself using the caller's token. If it is not
    // deployed yet that is not an error: the session is still worth recording,
    // just without the IP block.
    const { error: functionError } = await supabase.functions.invoke('capture-session', {
      body: { session: payload },
    });
    if (!functionError) return;

    const { error } = await supabase
      .from('device_sessions')
      .upsert(
        { ...payload, user_id: userId, captured_by: 'client' },
        { onConflict: 'user_id,session_id' }
      );

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (saveDeviceSessionToCloud):', error.message);
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save device session to Supabase. Continuing locally.', error);
  }
};

/**
 * Reads the owner's saved preferences.
 *
 * The language has to come back from here or it is not really saved: the browser
 * copy disappears with a reinstall, a cleared cache or a new phone, and until
 * now that was the only copy. Row-level security already lets an owner select
 * their own row (supabase/schema.sql, "owner selects own preferences").
 */
export const fetchMerchantPreferencesFromCloud = async (
  explicitUserId?: string,
): Promise<{ preferred_language: string | null } | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) return null;

    const { data, error } = await supabase
      .from('merchant_preferences')
      .select('preferred_language')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Supabase DB Error (fetchMerchantPreferencesFromCloud):', error.message);
      return null;
    }
    if (!data) return null;

    return {
      preferred_language:
        typeof data.preferred_language === 'string' ? data.preferred_language : null,
    };
  } catch (error) {
    console.warn('Failed to read merchant preferences from Supabase.', error);
    return null;
  }
};

/**
 * One small row of merchant preferences, keyed by owner.
 */
export const saveMerchantPreferencesToCloud = async (explicitUserId?: string): Promise<void> => {
  try {
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — an ownerless row would be
    // adopted by whichever account signs in next.
    if (!userId) return;

    const { error } = await supabase
      .from('merchant_preferences')
      .upsert(
        {
          user_id: userId,
          preferred_language: localStorage.getItem('dukan-language') || 'en',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (saveMerchantPreferencesToCloud):', error.message);
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save merchant preferences to Supabase.', error);
  }
};

/**
 * Writes the account's identity row: email, name, picture and provider.
 *
 * The database seeds this row from auth.users at signup, so this is a refresh
 * that stamps the sign-in time rather than the first write. Only non-null fields
 * are sent, so a session that lacks a value cannot blank one the trigger already
 * filled; guests write nothing.
 */
export const saveUserIdentityToCloud = async (explicitUserId?: string): Promise<void> => {
  try {
    if (!isSupabaseConfigured()) return;

    const user = await currentAuthUser();
    const userId = explicitUserId || user?.id || (await resolveActiveUserId());
    // Guests never write to the shared cloud tables — an ownerless identity row
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    // Without the session there is no created_at to satisfy the NOT NULL
    // signup_at, and a cached id is not an identity to refresh. The signup
    // trigger owns the row in that case.
    if (!user) return;

    const identity = identityRowFromAuthUser(user);
    const localName = typeof localStorage !== 'undefined' ? localStorage.getItem('dukan-profile-name') : null;
    const emailName = user?.email && user.email.includes('@') ? user.email.split('@')[0].replace(/[._+]/g, ' ') : null;
    const fallbackName = (localName || emailName || '').trim();

    if (!identity.owner_first_name && fallbackName) {
      const parts = fallbackName.split(/\s+/).filter(Boolean);
      identity.owner_first_name = parts[0] || 'Store';
      identity.owner_last_name = parts.length > 1 ? parts.slice(1).join(' ') : 'Owner';
      identity.display_name = `${identity.owner_first_name} ${identity.owner_last_name}`.trim();
    }

    const row = {
      user_id: userId,
      last_sign_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...nonNullColumns(identity),
    };

    const { error } = await supabase
      .from('user_identities')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (saveUserIdentityToCloud):', error.message);
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save the user identity to Supabase.', error);
  }
};

/**
 * Push just the store's position to the owner's profile row.
 *
 * Separate from saveBusinessProfileToCloud because the catalog gate can capture
 * a position long after onboarding, when the profile row already exists and
 * nothing else needs rewriting. Without this the coordinates would live only in
 * the browser that captured them: a second device would find nothing to restore
 * and would have to be standing in the shop again.
 *
 * An UPDATE rather than an upsert: the row may not exist yet (the owner has not
 * finished onboarding), and an upsert would fail on the NOT NULL store_name. A
 * no-op update is safe because the position is also in localStorage, so the next
 * saveBusinessProfileToCloud carries it along.
 */
export const saveStoreLocationToCloud = async (
  location: StoreLocation,
  explicitUserId?: string,
): Promise<void> => {
  try {
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) return;

    const { error } = await supabase
      .from('business_profiles')
      .update({
        store_lat: location.lat,
        store_lng: location.lng,
        store_location_accuracy_m: location.accuracy_m,
        store_location_source: location.source,
        store_location_captured_at: location.captured_at,
      })
      .eq('user_id', userId);

    if (error) {
      noteSyncError();
      console.warn('Supabase DB Error (saveStoreLocationToCloud):', error.message);
    }
  } catch (error) {
    noteSyncError();
    console.warn('Failed to save the store location to Supabase.', error);
  }
};

// The boot path is not called once: React StrictMode runs effects twice, and the
// auth listener fires separately for the restored session and the fresh sign-in.
// Both telemetry writes are therefore once-per-load, guarded here rather than at
// the call site so a second caller cannot reintroduce the duplicate. A retry
// after a failure is deliberately not attempted — a missing telemetry row costs
// less than an app that keeps retrying one.
let deviceSessionRecorded = false;
let merchantPreferencesRecorded = false;
let userIdentityRecorded = false;

/** One device session row per app load. */
export const syncDeviceSessionOnceForAppLoad = async (): Promise<void> => {
  if (deviceSessionRecorded) return;
  deviceSessionRecorded = true;
  await saveDeviceSessionToCloud();
};

/** One preferences row per app load. */
export const syncMerchantPreferencesOnceForAppLoad = async (): Promise<void> => {
  if (merchantPreferencesRecorded) return;
  merchantPreferencesRecorded = true;
  await saveMerchantPreferencesToCloud();
};

/** One identity row per app load. */
export const syncUserIdentityOnceForAppLoad = async (): Promise<void> => {
  if (userIdentityRecorded) return;
  userIdentityRecorded = true;
  await saveUserIdentityToCloud();
};

/**
 * Automatically loads user data from Supabase upon login, or uploads and claims local data under the user's UUID.
 */
export const syncOnLogin = async (
  currentOrders: Order[],
  currentProducts: Product[],
  loggedInUser?: User | null
): Promise<{
  profile: any | null;
  products: Product[] | null;
  orders: Order[] | null;
  /**
   * The language saved against this account, if any. Returned from the same
   * round trip as the rest of the restore so the caller can apply it BEFORE the
   * boot-time preferences write, which would otherwise push this device's
   * default English over the account's real choice.
   */
  language: string | null;
}> => {
  try {
    if (!isSupabaseConfigured()) {
      return { profile: null, products: null, orders: null, language: null };
    }

    const userId = await resolveActiveUserId(loggedInUser?.id);
    if (!userId) {
      console.warn('syncOnLogin: no active user ID');
      return { profile: null, products: null, orders: null, language: null };
    }

    console.log('Synchronizing Supabase database for user UUID:', userId);

    // Fetch existing cloud data for this owner only
    const cloudProfile = await fetchBusinessProfileFromCloud();
    const cloudProducts = await fetchProductsFromCloud();
    const cloudOrders = await fetchOrdersFromCloud();
    const cloudPreferences = await fetchMerchantPreferencesFromCloud(userId);
    const language = cloudPreferences?.preferred_language ?? cloudProfile?.preferredLanguage ?? null;

    const hasCloudData = Boolean(
      cloudProfile || 
      (cloudProducts && cloudProducts.length > 0) || 
      (cloudOrders && cloudOrders.length > 0)
    );

    // If cloud records already exist in Supabase for this user, restore them into app state
    if (hasCloudData) {
      console.log('Restored existing store data from Supabase DB.');
      return {
        profile: cloudProfile,
        products: cloudProducts,
        orders: cloudOrders,
        language,
      };
    }

    // Otherwise, first-time sign-in / registration:
    // Persist current store details, products, and orders under the user's UUID!
    // No placeholder: writing a profile row before onboarding would hand the
    // account a "My Store" store, and a profile row is what marks an account as
    // already onboarded — the row has to wait for the real name.
    const storeName = localStorage.getItem('dukan-store-name');
    const storeContext = localStorage.getItem('dukan-store-context');
    const category = localStorage.getItem('dukan-store-category');
    
    if (storeName) {
      const profileData = {
        storeDetails: {
          storeName,
          category: category || 'Kirana / General Store',
        },
        answers: storeContext ? JSON.parse(storeContext) : {},
        ownerName: localStorage.getItem('dukan-profile-name') || undefined,
        timestamp: new Date().toISOString()
      };
      const onboardingRaw = localStorage.getItem('dukan-business-intelligence-context');
      let onboarding: any = undefined;
      try {
        if (onboardingRaw) onboarding = JSON.parse(onboardingRaw);
      } catch (e) {
        console.warn('syncOnLogin: could not parse business intelligence context', e);
      }

      await saveBusinessProfileToCloud(storeName, profileData, userId, onboarding);
    }

    if (currentProducts && currentProducts.length > 0) {
      await syncProductsToCloud(currentProducts, userId);
    }

    if (currentOrders && currentOrders.length > 0) {
      await syncOrdersToCloud(currentOrders, userId);
    }

    console.log('Successfully initialized user store in Supabase with user_id:', userId);

    return { profile: null, products: null, orders: null, language };
  } catch (error) {
    console.warn('Error in syncOnLogin:', error);
    return { profile: null, products: null, orders: null, language: null };
  }
};
