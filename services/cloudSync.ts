import { supabase, isSupabaseConfigured } from '../supabase.ts';
import { Product, Order, OrderStatus, UserProfile } from '../types.ts';
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

/**
 * Saves or updates a shopkeeper user profile in the public.users table.
 */
export const saveUserProfile = async (
  userData: Partial<UserProfile> | any,
  explicitUserId?: string
): Promise<UserProfile | null> => {
  try {
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured. User profile not saved to cloud.');
      return null;
    }

    const userId = await resolveActiveUserId(explicitUserId || userData?.id);
    if (!userId) {
      console.warn('saveUserProfile: No authenticated user ID found.');
      return null;
    }

    const payload: Record<string, any> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };

    if (userData.email !== undefined) payload.email = userData.email;
    const ownerName = userData.owner_name ?? userData.ownerName;
    if (ownerName !== undefined) payload.owner_name = ownerName;
    const storeName = userData.store_name ?? userData.storeName;
    if (storeName !== undefined) payload.store_name = storeName;
    const storeCategory = userData.store_category ?? userData.storeCategory;
    if (storeCategory !== undefined) payload.store_category = storeCategory;
    const phoneNumber = userData.phone_number ?? userData.phoneNumber;
    if (phoneNumber !== undefined) payload.phone_number = phoneNumber;
    if (userData.address !== undefined) payload.address = userData.address;
    const upiId = userData.upi_id ?? userData.upiId;
    if (upiId !== undefined) payload.upi_id = upiId;

    const { data, error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Supabase DB Error (saveUserProfile):', error.message);
      return null;
    }

    console.log('User profile saved successfully to public.users for ID:', userId);
    return data as UserProfile;
  } catch (error) {
    console.warn('Failed to save user profile to public.users:', error);
    return null;
  }
};

/**
 * Fetches the shopkeeper user profile from public.users table.
 */
export const fetchUserProfile = async (explicitUserId?: string): Promise<UserProfile | null> => {
  try {
    if (!isSupabaseConfigured()) return null;

    const userId = await resolveActiveUserId(explicitUserId);
    if (!userId) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Supabase DB Error (fetchUserProfile):', error.message);
      return null;
    }

    return data as UserProfile | null;
  } catch (error) {
    console.warn('Failed to fetch user profile from public.users:', error);
    return null;
  }
};

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
        .eq('id', docId);
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

    // Ensure any existing record for this store ID is claimed by userId
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

    const userId = await resolveActiveUserId(explicitUserId);

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
 * Explicitly maps customer details to top-level fields (customer_phone, customer_name, delivery_address)
 * and ensures payment_method and status are never rejected by DB constraints.
 */
export const syncOrdersToCloud = async (
  orders: Order[],
  explicitUserId?: string
): Promise<void> => {
  try {
    if (!orders || orders.length === 0) return;
    if (!isSupabaseConfigured()) return;

    const userId = await resolveActiveUserId(explicitUserId);

    const rows = orders.map(order => {
      const customerPhone = order.customer?.whatsappNumber || order.customer_phone || '';
      const customerName = order.customer?.name || order.customer_name || 'Walk-in Customer';
      const deliveryAddress = order.customer?.address || order.delivery_address || '—';

      return {
        id: order.id,
        user_id: userId,
        customer_phone: customerPhone || null,
        customer_name: customerName,
        delivery_address: deliveryAddress || null,
        customer: order.customer || {
          name: customerName,
          whatsappNumber: customerPhone,
          address: deliveryAddress,
        },
        items: order.items || [],
        total: Number(order.total ?? 0),
        payment_method: order.paymentMethod || 'COD',
        status: order.status || OrderStatus.NEW,
        notes: order.notes || null,
        created_at: order.timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

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
      customer: (item.customer && Object.keys(item.customer).length > 0)
        ? item.customer
        : {
            name: item.customer_name || 'Walk-in Customer',
            whatsappNumber: item.customer_phone || '',
            address: item.delivery_address || '—',
          },
      customer_name: item.customer_name || undefined,
      customer_phone: item.customer_phone || undefined,
      delivery_address: item.delivery_address || undefined,
      items: item.items || [],
      total: Number(item.total || 0),
      paymentMethod: (item.payment_method || 'COD') as 'COD' | 'UPI',
      status: (item.status || OrderStatus.NEW) as OrderStatus,
      timestamp: item.created_at || new Date().toISOString(),
      notes: item.notes || undefined,
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

    // 1. First claim any unassigned guest records from onboarding
    await claimUnassignedRecords(userId);

    // 2. Sync shopkeeper user profile (public.users)
    const userProfile = await fetchUserProfile(userId);
    if (userProfile) {
      if (userProfile.store_name) localStorage.setItem('dukan-store-name', userProfile.store_name);
      if (userProfile.store_category) localStorage.setItem('dukan-store-category', userProfile.store_category);
      if (userProfile.owner_name) localStorage.setItem('dukan-profile-name', userProfile.owner_name);
      if (userProfile.email) localStorage.setItem('dukan-profile-email', userProfile.email);
      if (userProfile.phone_number) localStorage.setItem('dukan-profile-phone', userProfile.phone_number);
      if (userProfile.address) localStorage.setItem('dukan-store-address', userProfile.address);
      if (userProfile.upi_id) localStorage.setItem('dukan-upi-id', userProfile.upi_id);
    } else {
      const storeName = localStorage.getItem('dukan-store-name') || 'My Kirana Store';
      const category = localStorage.getItem('dukan-store-category') || 'Grocery / Kirana';
      const ownerName = localStorage.getItem('dukan-profile-name') || loggedInUser?.user_metadata?.full_name || '';
      const email = loggedInUser?.email || localStorage.getItem('dukan-profile-email') || '';
      const phone = localStorage.getItem('dukan-profile-phone') || '';
      const address = localStorage.getItem('dukan-store-address') || '';
      const upiId = localStorage.getItem('dukan-upi-id') || '';

      await saveUserProfile({
        id: userId,
        email,
        owner_name: ownerName,
        store_name: storeName,
        store_category: category,
        phone_number: phone,
        address,
        upi_id: upiId,
      }, userId);
    }

    // 3. Fetch existing cloud business data
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
