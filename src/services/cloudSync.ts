import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { Product, Order } from '../types.ts';
import type { User } from './auth.ts';
import { collectDeviceSession, noteSyncError } from '../utils/telemetry.ts';
import { getStoredStoreLocation, StoreLocation } from '../utils/location.ts';
import { ownerColumnsFromAuthUser, orderRowFromOrder } from '../utils/cloudRows.ts';

/**
 * Helper to resolve the active user ID from explicit argument, Supabase session,
 * or localStorage cached auth state (dukan-auth-user).
 */
export const resolveActiveUserId = async (explicitUserId?: string): Promise<string | null> => {
  if (explicitUserId) return explicitUserId;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  } catch (e) {
    // Ignore error
  }

  try {
    const cached = localStorage.getItem('dukan-auth-user');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.id) return parsed.id;
    }
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
 * Safely saves the business profile to Supabase database without blocking the UI.
 * Associates record with user_id if user is logged in or cached.
 */
export const saveBusinessProfileToCloud = async (
  storeName: string,
  profileData: any,
  explicitUserId?: string,
  onboarding?: any
): Promise<void> => {
  try {
    if (!storeName || !profileData) return;
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured. Business profile stored locally.');
      return;
    }

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — an ownerless profile row
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    // The store's position is its own fact, not part of the profile blob: it is
    // what a new device restores to answer "where is this shop?" without asking
    // the shopkeeper to stand in it again.
    const storeLocation = getStoredStoreLocation();

    const { error } = await supabase
      .from('business_profiles')
      .upsert({
        user_id: userId,
        store_name: storeName,
        category: profileData?.storeDetails?.category ?? localStorage.getItem('dukan-store-category') ?? null,
        profile_data: profileData,
        onboarding: onboarding ?? {},
        // Owner identity, mirrored from the auth session: first/last name, picture,
        // provider and language. Without this the dashboard has only the raw
        // profile_data blob and these columns stay NULL.
        ...ownerColumnsFromAuthUser(await currentAuthUser()),
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
    }
  } catch (error) {
    console.warn('Failed to sync profile to Supabase cloud. Continuing with local data.', error);
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
        .select('profile_data, store_name, category, onboarding, store_lat, store_lng, store_location_accuracy_m, store_location_source, store_location_captured_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.profile_data) {
        // Merge the dynamic onboarding payload alongside the profile body so
        // callers can restore the AI Q&A, not just the raw answers.
        return {
          ...data.profile_data,
          category: data.category,
          onboarding: data.onboarding,
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
    if (!orders || orders.length === 0) return;
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);
    // Guests never write to the shared cloud tables — rows without an owner
    // would be adopted by whichever account signs in next.
    if (!userId) return;

    // `orderRowFromOrder` adds the flat customer columns beside the JSONB, so a
    // dashboard reads a column instead of digging into JSON.
    const now = new Date().toISOString();
    const rows = orders.map(order => orderRowFromOrder(order, userId, now));

    let { error } = await supabase
      .from('orders')
      .upsert(rows, { onConflict: 'user_id,external_id' });

    if (error && (error.code === 'PGRST204' || error.message?.includes('schema cache'))) {
      const baseRows = rows.map(({ customer_phone, customer_name, delivery_address, notes, ...rest }: any) => rest);
      const res = await supabase
        .from('orders')
        .upsert(baseRows, { onConflict: 'user_id,external_id' });
      error = res.error;
    }

    if (error) {
      console.warn('Supabase DB Error (syncOrdersToCloud):', error.message);
    } else {
      console.log(`Synced ${orders.length} orders to Supabase for user: ${userId || 'guest'}`);
    }
  } catch (error) {
    console.warn('Failed to sync orders to Supabase database.', error);
  }
};

/**
 * Fetches orders from Supabase database for the logged-in user.
 */
export const fetchOrdersFromCloud = async (): Promise<Order[] | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
      timestamp: item.created_at
    }));
  } catch (error) {
    console.warn('Failed to fetch orders from Supabase database.', error);
    return null;
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
          preferred_language: localStorage.getItem('dukan-language') || null,
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
}> => {
  try {
    if (!isSupabaseConfigured()) {
      return { profile: null, products: null, orders: null };
    }

    const userId = await resolveActiveUserId(loggedInUser?.id);
    if (!userId) {
      console.warn('syncOnLogin: no active user ID');
      return { profile: null, products: null, orders: null };
    }

    console.log('Synchronizing Supabase database for user UUID:', userId);

    // Fetch existing cloud data for this owner only
    const cloudProfile = await fetchBusinessProfileFromCloud();
    const cloudProducts = await fetchProductsFromCloud();
    const cloudOrders = await fetchOrdersFromCloud();

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

    return { profile: null, products: null, orders: null };
  } catch (error) {
    console.warn('Error in syncOnLogin:', error);
    return { profile: null, products: null, orders: null };
  }
};
