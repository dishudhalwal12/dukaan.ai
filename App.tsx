
import React, { useState, useCallback, useEffect, useRef } from 'react';
import DashboardScreen from './screens/DashboardScreen.tsx';
import BottomNav from './components/BottomNav.tsx';
import { Screen, Order, OrderStatus, OrderItem, Product, Customer } from './types.ts';
import SalesScreen from './screens/SalesScreen.tsx';
import InsightsScreen from './screens/InsightsScreen.tsx';
import CatalogScreen from './screens/CatalogScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import { ProductProvider, useProducts } from './contexts/ProductContext.tsx';
import { LanguageProvider } from './contexts/LanguageContext.tsx';
import OrdersScreen from './screens/OrdersScreen.tsx';
import { initialOrders } from './data/initialOrders.ts';
import NewOrderModal from './components/NewOrderModal.tsx';
import { initialProducts } from './data/initialProducts.ts';
import OnboardingFlow from './screens/OnboardingFlow.tsx';
import { mockCustomers } from './data/mockCustomers.ts';
import { generateRandomPhoneNumber } from './utils/phone.ts';
import Toast from './components/Toast.tsx';
import AuthModal from './components/AuthModal.tsx';
import { listenToAuthState, signOutUser, User } from './services/auth.ts';
import { syncOrdersToCloud, syncOnLogin } from './services/cloudSync.ts';
import { resolveTabsFromBusinessType, TabConfig } from './utils/tabResolver.ts';

const AppContent: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.DASHBOARD);
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
        const storedOrders = localStorage.getItem('dukaan-sales-data') || localStorage.getItem('dukan-orders');
        if (storedOrders) {
            const parsed = JSON.parse(storedOrders);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }

        // Check if it's a new user (onboarding not complete).
        const isNewUser = localStorage.getItem('dukan-onboarding-complete') !== 'true';
        if (isNewUser) {
            return []; // New users start with zero orders.
        }
        
        // Fallback for existing users who might have cleared their orders but not onboarding status.
        return initialOrders;

    } catch (error) {
        console.error("Failed to load orders from localStorage", error);
        // Safe fallback in case of any error
        const isNewUser = localStorage.getItem('dukan-onboarding-complete') !== 'true';
        return isNewUser ? [] : initialOrders;
    }
  });
  const [newOrderForPopup, setNewOrderForPopup] = useState<Order | null>(null);
  const [isInteractionDone, setInteractionDone] = useState(false);
  const [isOtherModalShowing, setIsOtherModalShowing] = useState(false);
  const { products, updateProduct, loadProducts } = useProducts();
  const ordersRef = useRef(orders);
  const productsRef = useRef(products);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { productsRef.current = products; }, [products]);

  // Simulation refs removed for Webhook Polling
  const activeScreenRef = useRef<Screen>(Screen.DASHBOARD);
  const isOtherModalShowingRef = useRef(false);
  // Persisted set of order IDs for which the modal has already been shown.
  // Survives page refreshes so the same order never pops up twice.
  const seenOrderIds = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem('dukan-seen-order-ids') ?? '[]') as string[])
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Auth state with local storage caching for immediate session persistence across page loads
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('dukan-auth-user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const authChecked = useRef(false);

  // Dynamic Tabs state — lazy initializer so nav renders immediately on first paint
  const [tabs, setTabs] = useState<TabConfig[]>(() => {
    const category = localStorage.getItem('dukan-store-category');
    const aiContext = localStorage.getItem('dukan-business-intelligence-context');
    return resolveTabsFromBusinessType(category, aiContext);
  });

  // Re-resolve tabs once onboarding completes (category may have just been written)
  useEffect(() => {
    const category = localStorage.getItem('dukan-store-category');
    const aiContext = localStorage.getItem('dukan-business-intelligence-context');
    setTabs(resolveTabsFromBusinessType(category, aiContext));
  }, [showOnboarding]);

  // Listen to Auth State and sync data to/from Supabase backend
  useEffect(() => {
    const unsubscribe = listenToAuthState(async (user) => {
      setCurrentUser(user);
      currentUserRef.current = user;

      if (user) {
        setShowAuthModal(false); // Close modal on successful authentication
        localStorage.removeItem('dukan-guest-mode');
        localStorage.removeItem('dukan-oauth-in-progress');

        // Restore store data from Supabase DB or migrate existing local store to cloud with user ID
        const cloudData = await syncOnLogin(ordersRef.current, productsRef.current, user);
        if (cloudData.orders && cloudData.orders.length > 0) {
          setOrders(cloudData.orders);
        }
        if (cloudData.products && cloudData.products.length > 0) {
          loadProducts(cloudData.products);
        }
        if (cloudData.profile) {
          if (cloudData.profile.storeDetails?.storeName) {
            localStorage.setItem('dukan-store-name', cloudData.profile.storeDetails.storeName);
          }
          if (cloudData.profile.storeDetails?.category) {
            localStorage.setItem('dukan-store-category', cloudData.profile.storeDetails.category);
          }
          if (cloudData.profile.answers) {
            localStorage.setItem('dukan-store-context', JSON.stringify(cloudData.profile.answers));
          }
          const cat = localStorage.getItem('dukan-store-category');
          const aiCtx = localStorage.getItem('dukan-business-intelligence-context');
          setTabs(resolveTabsFromBusinessType(cat, aiCtx));
        }
      }
    });
    return () => unsubscribe();
  }, [loadProducts]);

  useEffect(() => {
    try {
        const onboardingComplete = localStorage.getItem('dukan-onboarding-complete');
        if (onboardingComplete !== 'true') {
            setShowOnboarding(true);
        } else {
            setInteractionDone(true); // Returning users: start webhook polling immediately on mount
            
            // Check if returning from Google OAuth or already authenticated
            const hasOAuthParams = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
            const isOAuthInProgress = localStorage.getItem('dukan-oauth-in-progress') === 'true';

            if (!authChecked.current && !localStorage.getItem('dukan-guest-mode')) {
                authChecked.current = true;

                // If currently returning from OAuth, suppress auth modal
                if (hasOAuthParams || isOAuthInProgress) {
                    return;
                }

                // If already authenticated, do not show modal
                if (currentUserRef.current || localStorage.getItem('dukan-auth-user')) {
                    return;
                }

                // A slight delay ensures dashboard paints fully before the modal overlays
                setTimeout(() => {
                    if (!currentUserRef.current && !localStorage.getItem('dukan-auth-user') && !localStorage.getItem('dukan-guest-mode')) {
                        setShowAuthModal(true);
                    }
                }, 1200);
            }
        }
    } catch (error) {
        console.error("Failed to check onboarding status from localStorage", error);
        setError("Failed to load onboarding status.");
        // Fallback to showing onboarding if localStorage is inaccessible
        setShowOnboarding(true);
    }
  }, []);

  // Persist orders to localStorage and sync to Supabase whenever they change
  useEffect(() => {
    try {
        localStorage.setItem('dukaan-sales-data', JSON.stringify(orders));
        syncOrdersToCloud(orders);
    } catch (error)
        {
        console.error("Failed to save orders to localStorage", error);
        setError("Failed to save orders.");
    }
  }, [orders]);


  // No longer triggered by click — simulation starts explicitly after onboarding completes
  const handleFirstInteraction = useCallback(() => {}, []);

  const newOrderCount = orders.filter(o => o.status === OrderStatus.NEW).length;

  const handleNavigation = useCallback((screen: Screen) => {
    setActiveScreen(screen);
  }, []);

  const handleModalStateChange = useCallback((isOpen: boolean) => {
    setIsOtherModalShowing(isOpen);
  }, []);

  const handleUpdateStatus = (orderId: string, status: OrderStatus) => {
    const orderToUpdate = orders.find(o => o.id === orderId);

    // If an order is accepted (moved from NEW to PREPARING), update inventory.
    if (orderToUpdate && orderToUpdate.status === OrderStatus.NEW && status === OrderStatus.PREPARING) {
        orderToUpdate.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const newStock = Math.max(0, product.stock - item.quantity);
                updateProduct({ ...product, stock: newStock });
            }
        });
    } else if (orderToUpdate && status === OrderStatus.CANCELLED) {
        // If an order is cancelled, restore the stock
        orderToUpdate.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const newStock = product.stock + item.quantity;
                updateProduct({ ...product, stock: newStock });
            }
        });
    }

    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
    if (newOrderForPopup?.id === orderId) {
        setNewOrderForPopup(null);
    }
  };

  const handleAddOrders = useCallback((newOrders: Order[]) => {
    setOrders(prev => [...newOrders, ...prev]);
  }, []);

  // Keep refs in sync so polling closure always reads current values without being a dep
  useEffect(() => { activeScreenRef.current = activeScreen; }, [activeScreen]);
  useEffect(() => { isOtherModalShowingRef.current = isOtherModalShowing; }, [isOtherModalShowing]);

  // Poll n8n webhook for real orders — stable interval, never recreated on navigation
  useEffect(() => {
    if (!isInteractionDone) return;

    // Normalize a raw webhook payload so every required field is present
    // (the webhook may omit `total`, use bare numeric prices, etc.)
    const normalizeWebhookOrder = (raw: Record<string, unknown>): Order => {
      // Normalize items first — price may arrive as number 14 or string "₹14"
      const rawItems = Array.isArray(raw.items) ? raw.items as Array<Record<string, unknown>> : [];
      const items: OrderItem[] = rawItems.map(item => {
        const rawPrice = item.price ?? 0;
        // Ensure price is always a "₹XX" formatted string
        const priceNum = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).replace('₹', '') || '0');
        const price = `₹${priceNum}`;
        return {
          productId: String(item.productId ?? ''),
          name: String(item.name ?? 'Item'),
          quantity: Number(item.quantity ?? 1),
          price,
        };
      });

      // Compute total from items if webhook doesn't send it (or sends 0/null)
      const rawTotal = typeof raw.total === 'number' ? raw.total : parseFloat(String(raw.total ?? '0'));
      const computedTotal = rawTotal > 0
        ? rawTotal
        : items.reduce((sum, item) => sum + item.quantity * parseFloat(item.price.replace('₹', '') || '0'), 0);

      const customerName = String((raw.customer as Record<string, unknown>)?.name ?? raw.customer_name ?? raw.customerName ?? 'Walk-in Customer');
      const deliveryAddress = String((raw.customer as Record<string, unknown>)?.address ?? raw.delivery_address ?? raw.address ?? '—');
      const customerPhone = String((raw.customer as Record<string, unknown>)?.whatsappNumber ?? raw.customer_phone ?? raw.phone ?? '');

      return {
        id: String(raw.id ?? ''),
        status: (raw.status as OrderStatus) ?? OrderStatus.NEW,
        paymentMethod: (raw.paymentMethod ?? raw.payment_method ?? 'COD') as 'COD' | 'UPI',
        total: computedTotal,
        timestamp: String(raw.timestamp ?? raw.created_at ?? new Date().toISOString()),
        notes: raw.notes ? String(raw.notes) : undefined,
        items,
        customer: {
          name: customerName,
          address: deliveryAddress,
          whatsappNumber: customerPhone,
        },
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
      };
    };

    const pollWebhook = async () => {
      try {
        const response = await fetch('/webhook/latest-order');
        if (!response.ok) return;

        const rawOrder = await response.json();
        if (!rawOrder || !rawOrder.id) return;

        const fetchedOrder = normalizeWebhookOrder(rawOrder as Record<string, unknown>);

        // Guard: already shown the modal for this order (survives refresh via localStorage)
        if (seenOrderIds.current.has(fetchedOrder.id)) return;

        setOrders(prevOrders => {
          // Check for duplicate injection using authoritative ID
          if (prevOrders.some(o => o.id === fetchedOrder.id)) {
            return prevOrders;
          }

          // Mark as seen — persist immediately so a refresh can't re-trigger the modal
          seenOrderIds.current.add(fetchedOrder.id);
          localStorage.setItem('dukan-seen-order-ids', JSON.stringify([...seenOrderIds.current]));

          // It's a new order — read current screen/modal state from refs (no stale closure)
          if (activeScreenRef.current === Screen.SETTINGS || isOtherModalShowingRef.current) {
              console.log('New webhook order fetched, but popup suppressed due to active screen or another modal being open.');
          } else {
              // Trigger modal in the next tick to prevent stale state conflicts
              setTimeout(() => {
                  setNewOrderForPopup(fetchedOrder);
              }, 0);
          }

          return [fetchedOrder, ...prevOrders];
        });
      } catch (err) {
        // Silently ignore connection errors so app remains stable if n8n goes offline
      }
    };

    pollWebhook(); // immediate first check — no waiting for first tick
    const intervalId = setInterval(pollWebhook, 3000); // poll every 3 s
    return () => clearInterval(intervalId);
  }, [isInteractionDone]); // Stable: interval created once, never torn down on navigation

  const renderScreen = () => {
    switch (activeScreen) {
      case Screen.DASHBOARD:
        return <DashboardScreen orders={orders} onModalStateChange={handleModalStateChange} onAddOrders={handleAddOrders} />;
      case Screen.SALES:
        return <SalesScreen orders={orders} />;
      case Screen.ORDERS:
        return <OrdersScreen orders={orders} onUpdateStatus={handleUpdateStatus} onModalStateChange={handleModalStateChange} />;
      case Screen.CATALOG:
        return <CatalogScreen onModalStateChange={handleModalStateChange} />;
      case Screen.SETTINGS:
        return (
          <SettingsScreen 
            onModalStateChange={handleModalStateChange} 
            onLogout={handleLogout}
            currentUser={currentUser}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        );
      default:
        return <DashboardScreen orders={orders} onModalStateChange={handleModalStateChange} onAddOrders={handleAddOrders} />;
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setInteractionDone(true); // Start simulation engine after onboarding

    // Re-resolve tabs now that category is written to localStorage
    const category = localStorage.getItem('dukan-store-category');
    const aiContext = localStorage.getItem('dukan-business-intelligence-context');
    setTabs(resolveTabsFromBusinessType(category, aiContext));

    // Trigger auth check immediately post-onboarding if not logged in or in guest mode
    if (!currentUserRef.current && !localStorage.getItem('dukan-guest-mode') && !localStorage.getItem('dukan-auth-user')) {
        setTimeout(() => {
          if (!currentUserRef.current && !localStorage.getItem('dukan-guest-mode') && !localStorage.getItem('dukan-auth-user')) {
            setShowAuthModal(true);
          }
        }, 500);
    }
  };

  const handleGuestContinue = () => {
    setShowAuthModal(false);
    localStorage.setItem('dukan-guest-mode', 'true');
  };

  const handleLogout = useCallback(async () => {
    await signOutUser();
    localStorage.removeItem('dukan-guest-mode');
    localStorage.removeItem('dukan-auth-user');
    setCurrentUser(null);
    currentUserRef.current = null;
    setShowAuthModal(true);
  }, []);

  return (
    <div className="min-h-screen bg-black flex justify-center">
      <div className="w-full max-w-[460px] relative bg-black text-white shadow-[#ffffff1a] shadow-2xl flex flex-col min-h-screen" onClick={handleFirstInteraction}>
        <>
          <main className="pb-[calc(4rem+env(safe-area-inset-bottom))] flex-1 overflow-y-auto hide-scrollbar">
            {renderScreen()}
          </main>
          <BottomNav activeScreen={activeScreen} onNavigate={handleNavigation} newOrderCount={newOrderCount} tabs={tabs} />
           {newOrderForPopup && (
            <NewOrderModal 
              isOpen={!!newOrderForPopup} 
              order={newOrderForPopup} 
              onUpdateStatus={handleUpdateStatus}
            />
          )}
        </>
        {showOnboarding && <OnboardingFlow onComplete={handleOnboardingComplete} />}
        {showAuthModal && (
          <AuthModal 
            onClose={handleGuestContinue} 
            onSuccess={() => setShowAuthModal(false)} 
          />
        )}
        {error && <Toast message={error} onClose={() => setError(null)} />}
      </div>
    </div>
  );
};


const App: React.FC = () => (
    <LanguageProvider>
      <ProductProvider>
          <AppContent />
      </ProductProvider>
    </LanguageProvider>
);

export default App;
