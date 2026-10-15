import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { Product, Order } from '../types.ts';
import type { User } from './auth.ts';

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

/**
 * Safely saves the business profile to Supabase database without blocking the UI.
 * Associates record with user_id if user is logged in or cached.
 */
export const saveBusinessProfileToCloud = async (
  storeName: string, 
  profileData: any,
  explicitUserId?: string
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

    const docId = storeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    const { error } = await supabase
      .from('business_profiles')
      .upsert({
        id: docId,
        user_id: userId,
        store_name: storeName,
        profile_data: profileData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

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
        .select('profile_data, store_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.profile_data) {
        return data.profile_data;
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
      id: product.id,
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
      .upsert(rows, { onConflict: 'id' });

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

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

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
      id: item.id,
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

    const rows = orders.map(order => ({
      id: order.id,
      user_id: userId,
      customer: order.customer,
      items: order.items,
      total: order.total,
      payment_method: order.paymentMethod,
      status: order.status,
      created_at: order.timestamp,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('orders')
      .upsert(rows, { onConflict: 'id' });

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
      id: item.id,
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
    const storeName = localStorage.getItem('dukan-store-name') || 'My Store';
    const storeContext = localStorage.getItem('dukan-store-context');
    const category = localStorage.getItem('dukan-store-category');
    
    if (storeName) {
      const profileData = {
        storeDetails: {
          storeName,
          category: category || 'Kirana / General Store',
        },
        answers: storeContext ? JSON.parse(storeContext) : {},
        timestamp: new Date().toISOString()
      };
      await saveBusinessProfileToCloud(storeName, profileData, userId);
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
