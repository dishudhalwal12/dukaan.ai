
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
import { listenToAuthState, signOutUser } from './services/auth.ts';
import { User } from 'firebase/auth';
import { resolveTabsFromBusinessType, TabConfig } from './utils/tabResolver.ts';
import { playOrderChime } from './utils/audioAlert.ts';
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
  const { products, updateProduct } = useProducts();
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
  
  // Auth state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = listenToAuthState((user) => {
      setCurrentUser(user);
      if (user) {
        setShowAuthModal(false); // Close if they successfully log in
      }
    });
    return () => unsubscribe();
  }, []);

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
        const isOrdersRoute = typeof window !== 'undefined' && (window.location.hash.toLowerCase().includes('orders') || window.location.search.toLowerCase().includes('orders'));
        const onboardingComplete = localStorage.getItem('dukan-onboarding-complete');
        if (onboardingComplete !== 'true' && !isOrdersRoute) {
            setShowOnboarding(true);
        } else {
            setInteractionDone(true); // Returning users: start webhook polling immediately on mount
            if (!authChecked.current && !localStorage.getItem('dukan-guest-mode')) {
                // Onboarding is complete. If we haven't checked auth yet, do it now.
                authChecked.current = true;
                // A slight delay ensures dashboard paints fully before the modal overlays
                setTimeout(() => {
                    if (!currentUser) {
                        setShowAuthModal(true);
                    }
                }, 1000);
            }
        }
    } catch (error) {
        console.error("Failed to check onboarding status from localStorage", error);
        setError("Failed to load onboarding status.");
        setShowOnboarding(true);
    }
  }, []);

  // Persist orders to localStorage whenever they change
  useEffect(() => {
    try {
        localStorage.setItem('dukaan-sales-data', JSON.stringify(orders));
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

        for (const order of freshOrders) {
          if (order.status === OrderStatus.NEW && !seenOrderIds.current.has(order.id)) {
            console.log(`[Dukan Polling] Detected new order #${order.id} from ${order.customer?.name}`);
            playOrderChime();
            seenOrderIds.current.add(order.id);
            localStorage.setItem('dukan-seen-order-ids', JSON.stringify([...seenOrderIds.current]));
            setTimeout(() => {
              setNewOrderForPopup(order);
            }, 0);
          }
        }

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
        return <SettingsScreen onModalStateChange={handleModalStateChange} onLogout={handleLogout} />;
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

    // Trigger auth check immediately post-onboarding
    if (!currentUser && !localStorage.getItem('dukan-guest-mode')) {
        setTimeout(() => setShowAuthModal(true), 500);
    }
  };

  const handleGuestContinue = () => {
    setShowAuthModal(false);
    localStorage.setItem('dukan-guest-mode', 'true');
  };

  const handleLogout = useCallback(async () => {
    await signOutUser();
    localStorage.removeItem('dukan-guest-mode');
    setCurrentUser(null);
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
