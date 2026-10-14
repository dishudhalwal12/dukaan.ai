import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { Product, Order } from '../types.ts';
import type { User } from './auth.ts';

/**
 * Claims any rows in business_profiles, products, or orders that were created
 * during guest onboarding (where user_id IS NULL) and links them to this user.
 */
export const claimUnassignedRecords = async (userId: string): Promise<void> => {
  try {
    if (!userId || !isSupabaseConfigured()) return;

    // Link unassigned business profile
    const storeName = localStorage.getItem('dukan-store-name');
    if (storeName) {
      const docId = storeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      await supabase
        .from('business_profiles')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', docId)
        .is('user_id', null);
    }

    // Link unassigned products
    await supabase
      .from('products')
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .is('user_id', null);

    // Link unassigned orders
    await supabase
      .from('orders')
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .is('user_id', null);

    console.log('Unassigned records linked to authenticated user:', userId);
  } catch (err) {
    console.warn('Could not claim unassigned records:', err);
  }
};

/**
 * Safely saves the business profile to Supabase database without blocking the UI.
 * Associates record with user_id if user is logged in.
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

    let userId = explicitUserId ?? null;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    }

    // Consistent docId based on store name slug
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
      console.log(`Business profile saved in Supabase for user: ${userId || 'guest'}`);
    }

    // Ensure any previously null user_id row with this docId is claimed
    if (userId) {
      await supabase
        .from('business_profiles')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', docId);
    }
  } catch (error) {
    console.warn('Failed to sync profile to Supabase cloud. Continuing with local data.', error);
  }
};

/**
 * Safely fetches a business profile from Supabase database.
 * Priority: checks for active user's profile first, then by storeName.
 */
export const fetchBusinessProfileFromCloud = async (storeName?: string): Promise<any | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

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

    if (storeName) {
      const docId = storeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const { data, error } = await supabase
        .from('business_profiles')
        .select('profile_data')
        .eq('id', docId)
        .maybeSingle();

      if (!error && data?.profile_data) {
        return data.profile_data;
      }
    }

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

    let userId = explicitUserId ?? null;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    }

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
 * Fetches products from Supabase database for the active user.
 */
export const fetchProductsFromCloud = async (): Promise<Product[] | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', session.user.id);

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

    let userId = explicitUserId ?? null;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    }

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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', session.user.id)
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

    let userId = loggedInUser?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }

    if (!userId) {
      console.warn('syncOnLogin: no active user ID');
      return { profile: null, products: null, orders: null };
    }

    console.log('Synchronizing Supabase database for user UUID:', userId);

    // 1. First claim any unassigned guest records from onboarding
    await claimUnassignedRecords(userId);

    // 2. Fetch existing cloud data
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

    // Otherwise, first-time Google sign-in:
    // Persist current store details, products, and orders under the user's UUID!
    const storeName = localStorage.getItem('dukan-store-name') || 'My Store';
    const storeContext = localStorage.getItem('dukan-store-context');
    const category = localStorage.getItem('dukan-store-category');
    
    if (storeName) {
      const profileData = {
        storeDetails: {
          storeName,
          category: category || 'Grocery',
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
