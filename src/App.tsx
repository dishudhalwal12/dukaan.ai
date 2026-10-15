
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
import NewOrderModal from './components/NewOrderModal.tsx';
import { initialProducts } from './data/initialProducts.ts';
import OnboardingFlow from './screens/OnboardingFlow.tsx';
import { generateRandomPhoneNumber } from './utils/phone.ts';
import Toast from './components/Toast.tsx';
import AuthModal from './components/AuthModal.tsx';
import { listenToAuthState, signOutUser, User } from './services/auth.ts';
import { syncOrdersToCloud, syncOnLogin } from './services/cloudSync.ts';
import { resolveTabsFromBusinessType, TabConfig } from './utils/tabResolver.ts';
import { playOrderChime } from './utils/audioAlert.ts';
import { clearLocalStore, currentIdentity, enforceDataOwnership } from './utils/localStore.ts';
import { whatsappService, WhatsAppEvent } from './services/whatsappService.ts';

const getInitialScreen = (): Screen => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.toLowerCase().replace('#', '');
    const tab = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();
    const target = hash || tab;
    if (target === 'orders') return Screen.ORDERS;
    if (target === 'sales') return Screen.SALES;
    if (target === 'catalog') return Screen.CATALOG;
    if (target === 'settings') return Screen.SETTINGS;
    if (target === 'dashboard') return Screen.DASHBOARD;
  }
  return Screen.DASHBOARD;
};

const AppContent: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<Screen>(getInitialScreen);
  const [orders, setOrders] = useState<Order[]>(() => {
    // The cache is per-device but orders are per-account: drop another
    // account's data before reading it, so a new account starts empty.
    enforceDataOwnership(currentIdentity());
    try {
        const storedOrders = localStorage.getItem('dukaan-sales-data') || localStorage.getItem('dukan-orders');
        if (storedOrders) {
            const parsed = JSON.parse(storedOrders);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }

        // No demo/seed orders: a store with nothing stored starts empty.
        return [];

    } catch (error) {
        console.error("Failed to load orders from localStorage", error);
        // Safe fallback in case of any error
        return [];
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

      // Local store data belongs to one account. If this device still holds a
      // different account's data, drop it and reboot clean so nothing leaks
      // across accounts (the "new account shows the old orders" bug).
      const identity = user?.id ?? 'guest';
      const droppedForeignData = enforceDataOwnership(identity);
      if (user) {
        // enforceDataOwnership may have just wiped the cached auth user.
        localStorage.setItem('dukan-auth-user', JSON.stringify({ id: user.id, email: user.email }));
      }
      if (droppedForeignData) {
        setOrders([]);
        loadProducts([]);
        if (!sessionStorage.getItem('dukan-ownership-reboot')) {
          sessionStorage.setItem('dukan-ownership-reboot', '1');
          window.location.reload();
          return;
        }
      } else {
        sessionStorage.removeItem('dukan-ownership-reboot');
      }

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
          if (cloudData.profile.onboarding) {
            localStorage.setItem('dukan-business-intelligence-context', JSON.stringify(cloudData.profile.onboarding));
          }
          // The cloud profile carries the name across devices; a name the user
          // just typed locally is fresher, so only fill the gap.
          if (cloudData.profile.ownerName && !localStorage.getItem('dukan-profile-name')) {
            localStorage.setItem('dukan-profile-name', cloudData.profile.ownerName);
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
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase().replace('#', '');
      if (hash === 'orders') setActiveScreen(Screen.ORDERS);
      else if (hash === 'sales') setActiveScreen(Screen.SALES);
      else if (hash === 'catalog') setActiveScreen(Screen.CATALOG);
      else if (hash === 'settings') setActiveScreen(Screen.SETTINGS);
      else if (hash === 'dashboard') setActiveScreen(Screen.DASHBOARD);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    try {
        // The #orders deep link is the WhatsApp webhook path — it must not be
        // interrupted by the first-run gates.
        const isOrdersRoute = typeof window !== 'undefined' &&
            (window.location.hash.toLowerCase().includes('orders') || window.location.search.toLowerCase().includes('orders'));

        // Returning from Google OAuth: the redirect resolves auth by itself, so
        // the modal stays shut.
        const hasOAuthParams = window.location.search.includes('code=') || window.location.hash.includes('access_token=');
        const isOAuthInProgress = localStorage.getItem('dukan-oauth-in-progress') === 'true';

        const isAuthenticated = Boolean(currentUserRef.current || localStorage.getItem('dukan-auth-user'));
        const isGuest = Boolean(localStorage.getItem('dukan-guest-mode'));

        if (isOrdersRoute || hasOAuthParams || isOAuthInProgress) {
            setInteractionDone(true);
            return;
        }

        if (isGuest) {
            // Guests onboard locally — no account, no cloud writes.
            if (localStorage.getItem('dukan-onboarding-complete') !== 'true') {
                setShowOnboarding(true);
            } else {
                setInteractionDone(true);
            }
            return;
        }

        if (isAuthenticated) {
            // Onboarding, if still needed, is raised by the auth listener.
            setInteractionDone(true); // Returning users: start webhook polling immediately on mount
            return;
        }

        // Onboarding is no longer a mount-time gate. Sign in / sign up comes
        // first; the auth listener starts onboarding only for accounts that
        // have not completed it. See the listener below.
        if (!authChecked.current) {
            authChecked.current = true;
            setShowAuthModal(true);
        }
    } catch (error) {
        console.error("Failed to check onboarding status from localStorage", error);
        setError("Failed to load onboarding status.");
        setShowAuthModal(true);
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

    // If an order is accepted (moved from NEW to PREPARING), update inventory and notify customer on WhatsApp
    if (orderToUpdate && orderToUpdate.status === OrderStatus.NEW && status === OrderStatus.PREPARING) {
        orderToUpdate.items.forEach(item => {
            const product = products.find(p => p.id === item.productId || p.name.toLowerCase() === item.name.toLowerCase());
            if (product) {
                const newStock = Math.max(0, product.stock - item.quantity);
                updateProduct({ ...product, stock: newStock });
            }
        });

        // Trigger real WhatsApp confirmation message via Baileys backend
        whatsappService.acceptOrder(orderId).catch(err => {
            console.error('[WhatsAppService] Failed to notify customer of order acceptance:', err);
        });
    } else if (orderToUpdate && status === OrderStatus.READY_FOR_PICKUP) {
        // Trigger doorstep / at pickup notification to customer via WhatsApp
        whatsappService.readyOrder(orderId).catch(err => {
            console.error('[WhatsAppService] Failed to notify customer of doorstep arrival:', err);
        });
    } else if (orderToUpdate && status === OrderStatus.COMPLETED) {
        // Trigger delivery completion message and persist COMPLETED in backend store
        whatsappService.deliverOrder(orderId).catch(err => {
            console.error('[WhatsAppService] Failed to notify customer of order delivery:', err);
        });
    } else if (orderToUpdate && status === OrderStatus.REJECTED) {
        // Trigger real WhatsApp rejection message via Baileys backend
        whatsappService.rejectOrder(orderId).catch(err => {
            console.error('[WhatsAppService] Failed to notify customer of order rejection:', err);
        });
    } else if (orderToUpdate && status === OrderStatus.CANCELLED) {
        // If an order is cancelled, restore the stock
        orderToUpdate.items.forEach(item => {
            const product = products.find(p => p.id === item.productId || p.name.toLowerCase() === item.name.toLowerCase());
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

  // Keep refs in sync so event listeners always read current values without stale closures
  useEffect(() => { activeScreenRef.current = activeScreen; }, [activeScreen]);
  useEffect(() => { isOtherModalShowingRef.current = isOtherModalShowing; }, [isOtherModalShowing]);

  // Normalize real WhatsApp order payload to Dukaan Order interface
  const normalizeIncomingOrder = useCallback((raw: Record<string, any>): Order => {
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: OrderItem[] = rawItems.map((item: any) => {
      const rawPrice = item.price ?? 0;
      const priceNum = typeof rawPrice === 'number'
        ? rawPrice
        : parseFloat(String(rawPrice).replace(/[^\d.]/g, '') || '0');
      return {
        productId: String(item.id || item.productId || ''),
        name: String(item.name || 'Item'),
        quantity: Number(item.quantity || 1),
        price: `₹${priceNum}`,
      };
    });

    const rawTotal = typeof raw.totalAmount === 'number'
      ? raw.totalAmount
      : (typeof raw.total === 'number' ? raw.total : parseFloat(String(raw.totalAmount || raw.total || '0')));

    const computedTotal = rawTotal > 0
      ? rawTotal
      : items.reduce((sum, item) => sum + item.quantity * parseFloat(item.price.replace('₹', '') || '0'), 0);

    let mappedStatus = OrderStatus.NEW;
    if (raw.status === 'ACCEPTED' || raw.status === 'PREPARING') mappedStatus = OrderStatus.PREPARING;
    else if (raw.status === 'OUT_FOR_DELIVERY' || raw.status === 'READY_FOR_PICKUP') mappedStatus = OrderStatus.READY_FOR_PICKUP;
    else if (raw.status === 'DELIVERED' || raw.status === 'COMPLETED') mappedStatus = OrderStatus.COMPLETED;
    else if (raw.status === 'REJECTED') mappedStatus = OrderStatus.REJECTED;
    else if (raw.status === 'CANCELLED') mappedStatus = OrderStatus.CANCELLED;

    const customerPhone = String(raw.customer?.whatsappNumber || raw.customerPhone || raw.phone || '');
    const customerAddress = String(raw.customer?.address || raw.deliveryAddress || '—');
    const rawLoc = raw.location || raw.customer?.location || null;
    const urlMatch = customerAddress.match(/https?:\/\/[^\s)]+/);
    const mapsUrl = rawLoc?.mapsUrl || raw.mapsUrl || (urlMatch ? urlMatch[0] : undefined);
    const latitude = typeof rawLoc?.latitude === 'number' ? rawLoc.latitude : undefined;
    const longitude = typeof rawLoc?.longitude === 'number' ? rawLoc.longitude : undefined;

    return {
      id: String(raw.id || ''),
      status: mappedStatus,
      paymentMethod: (raw.paymentMethod as 'COD' | 'UPI') || 'COD',
      total: computedTotal,
      timestamp: String(raw.createdAt || raw.timestamp || new Date().toISOString()),
      items,
      customer: {
        name: String(raw.customer?.name || raw.customerName || 'WhatsApp Customer'),
        address: customerAddress,
        whatsappNumber: customerPhone,
        mapsUrl,
        latitude,
        longitude,
      },
      customerJid: raw.customerJid || (customerPhone ? `${customerPhone}@s.whatsapp.net` : undefined),
    };
  }, []);

  // Sync real orders from WhatsApp backend on mount
  useEffect(() => {
    whatsappService.fetchOrders().then(res => {
      if (res?.orders && res.orders.length > 0) {
        const backendOrders: Order[] = res.orders.map((o: any) => normalizeIncomingOrder(o)).filter((o: Order) => Boolean(o.id));
        setOrders(prev => {
          const prevMap = new Map(prev.map(p => [p.id, p]));
          const merged: Order[] = [];

          for (const b of backendOrders) {
            const existing = prevMap.get(b.id);
            if (existing) {
              // Update with authoritative backend data, guarding against status regression
              const effectiveStatus = (existing.status === OrderStatus.COMPLETED && b.status !== OrderStatus.COMPLETED)
                ? OrderStatus.COMPLETED
                : b.status;

              merged.push({
                ...existing,
                ...b,
                status: effectiveStatus,
                total: b.total > 0 ? b.total : existing.total,
                items: b.items && b.items.length > 0 ? b.items : existing.items,
              });
              prevMap.delete(b.id);
            } else {
              merged.push(b);
            }
          }

          // Retain any purely local orders not in backend
          for (const remaining of prevMap.values()) {
            merged.push(remaining);
          }

          return merged;
        });
      }
    }).catch(err => {
      console.warn('[Dukan] Failed to fetch backend orders on mount:', err);
    });
  }, [normalizeIncomingOrder]);

  // Real-time WhatsApp Baileys SSE listener + 2.5s robust polling fallback
  useEffect(() => {
    const unsubscribe = whatsappService.subscribeToEvents((event: WhatsAppEvent) => {
      if (event.type === 'dukan_new_order' && event.order) {
        const incomingOrder = normalizeIncomingOrder(event.order);
        if (!incomingOrder.id) return;

        // Dedup: already alerted/seen
        if (seenOrderIds.current.has(incomingOrder.id)) return;

        // Play dual-tone chime
        playOrderChime();

        setOrders(prevOrders => {
          if (prevOrders.some(o => o.id === incomingOrder.id)) {
            return prevOrders;
          }

          seenOrderIds.current.add(incomingOrder.id);
          localStorage.setItem('dukan-seen-order-ids', JSON.stringify([...seenOrderIds.current]));

          // Trigger popup unless suppressed by active subscreen or another open modal
          if (activeScreenRef.current === Screen.SETTINGS || isOtherModalShowingRef.current) {
            console.log('[WhatsApp Order] Received new order, but popup suppressed due to active modal/screen.');
          } else {
            setTimeout(() => {
              setNewOrderForPopup(incomingOrder);
            }, 0);
          }

          return [incomingOrder, ...prevOrders];
        });
      } else if (event.type === 'dukan_order_updated' && event.order) {
        const updated = normalizeIncomingOrder(event.order);
        if (updated.id) {
          setOrders(prev => prev.map(o => {
            if (o.id !== updated.id) return o;
            const effectiveStatus = (o.status === OrderStatus.COMPLETED && updated.status !== OrderStatus.COMPLETED)
              ? OrderStatus.COMPLETED
              : updated.status;
            return {
              ...o,
              ...updated,
              status: effectiveStatus,
              total: updated.total > 0 ? updated.total : o.total,
              items: updated.items && updated.items.length > 0 ? updated.items : o.items,
            };
          }));
        }
      }
    });

    // 2.5s polling fallback to ensure 100% delivery guarantee
    const pollInterval = setInterval(() => {
      whatsappService.fetchOrders().then(res => {
        if (!res?.orders || !Array.isArray(res.orders)) return;
        const freshOrders: Order[] = res.orders.map((o: any) => normalizeIncomingOrder(o)).filter((o: Order) => Boolean(o.id));

        // The poll is a state-reconcile path only. It must NOT raise order
        // alerts: on a fresh browser it sees every pre-existing NEW order at
        // once and would fire one chime per order (an 898-chime storm here).
        // New-order alerting belongs to the SSE `dukan_new_order` handler,
        // which only fires for orders created after the client connected.
        setOrders(prev => {
          const freshMap = new Map(freshOrders.map(f => [f.id, f]));
          return prev.map(p => {
            const matched = freshMap.get(p.id);
            if (!matched) return p;

            // Prevent status regression from COMPLETED back to PREPARING
            const effectiveStatus = (p.status === OrderStatus.COMPLETED && matched.status !== OrderStatus.COMPLETED)
              ? OrderStatus.COMPLETED
              : matched.status;

            return {
              ...p,
              ...matched,
              status: effectiveStatus,
              total: matched.total > 0 ? matched.total : p.total,
              items: matched.items && matched.items.length > 0 ? matched.items : p.items,
            };
          });
        });
      }).catch(() => {});
    }, 2500);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [normalizeIncomingOrder]);

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
    // Guests onboard locally; the auth-first gate no longer runs it for them.
    if (localStorage.getItem('dukan-onboarding-complete') !== 'true') {
      setShowOnboarding(true);
    }
  };

  const handleLogout = useCallback(async () => {
    await signOutUser();
    clearLocalStore();
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
