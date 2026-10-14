
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
    try {
        const onboardingComplete = localStorage.getItem('dukan-onboarding-complete');
        if (onboardingComplete !== 'true') {
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
        // Fallback to showing onboarding if localStorage is inaccessible
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

    return {
      id: String(raw.id || ''),
      status: mappedStatus,
      paymentMethod: (raw.paymentMethod as 'COD' | 'UPI') || 'COD',
      total: computedTotal,
      timestamp: String(raw.createdAt || raw.timestamp || new Date().toISOString()),
      items,
      customer: {
        name: String(raw.customer?.name || raw.customerName || 'WhatsApp Customer'),
        address: String(raw.customer?.address || raw.deliveryAddress || '—'),
        whatsappNumber: customerPhone,
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
          const prevIds = new Set(prev.map(p => p.id));
          const toAdd = backendOrders.filter(b => !prevIds.has(b.id));
          if (toAdd.length === 0) {
            return prev.map(p => {
              const matched = backendOrders.find(b => b.id === p.id);
              return matched ? { ...p, status: matched.status } : p;
            });
          }
          return [...toAdd, ...prev];
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
          setOrders(prev => prev.map(o => (o.id === updated.id ? { ...o, status: updated.status } : o)));
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
          const prevIds = new Set(prev.map(p => p.id));
          const toAdd = freshOrders.filter(b => !prevIds.has(b.id));
          if (toAdd.length === 0) {
            return prev.map(p => {
              const matched = freshOrders.find(b => b.id === p.id);
              return matched ? { ...p, status: matched.status } : p;
            });
          }
          return [...toAdd, ...prev];
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
