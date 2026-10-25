
import React, { useState, useCallback, useEffect, useRef } from 'react';
import DashboardScreen from './screens/DashboardScreen.tsx';
import BottomNav from './components/BottomNav.tsx';
import { Screen, Order, OrderStatus, OrderItem, Product, Customer } from './types.ts';
import SalesScreen from './screens/SalesScreen.tsx';
import InsightsScreen from './screens/InsightsScreen.tsx';
import CatalogScreen from './screens/CatalogScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import PrivacyPolicyScreen from './screens/settings/PrivacyPolicyScreen.tsx';
import { ProductProvider, useProducts } from './contexts/ProductContext.tsx';
import { LanguageProvider, useLanguage, LANGUAGE_STORAGE_KEY } from './contexts/LanguageContext.tsx';
import OrdersScreen from './screens/OrdersScreen.tsx';
import NewOrderModal from './components/NewOrderModal.tsx';
import { initialProducts } from './data/initialProducts.ts';
import OnboardingFlow from './screens/OnboardingFlow.tsx';
import { generateRandomPhoneNumber } from './utils/phone.ts';
import Toast from './components/Toast.tsx';
import AuthModal from './components/AuthModal.tsx';
import WelcomeBackModal from './components/WelcomeBackModal.tsx';
import EmailConfirmScreen from './components/EmailConfirmScreen.tsx';
import { captureEmailConfirmParams } from './utils/confirmLink.ts';
import type { ConfirmParams } from './utils/confirmLink.ts';
import { listenToAuthState, signOutUser, User, getAuthUrlError, isOAuthPending, clearOAuthPending } from './services/auth.ts';
import { syncOrdersToCloud, syncOnLogin, syncDeviceSessionOnceForAppLoad, syncMerchantPreferencesOnceForAppLoad, syncUserIdentityOnceForAppLoad, isNewSignupForWalkthrough, fetchOrdersFromCloud, updateOrderStatusInCloud } from './services/cloudSync.ts';
import { hasStoreLocation, saveStoreLocation } from './utils/location.ts';
import { getInstallId } from './utils/telemetry.ts';
import { resolveTabsFromBusinessType, TabConfig } from './utils/tabResolver.ts';
import { playOrderChime } from './utils/audioAlert.ts';
import { mergePolledOrders, electPopupCandidates } from './utils/orderPolling.ts';
import { isNewOrder, isFinalOrderStatus } from './utils/orderStatus.ts';
import { claimOwnershipReboot, clearLocalStore, currentIdentity, enforceDataOwnership } from './utils/localStore.ts';
import { normalizeQuantity } from './utils/stock.ts';
import { consumeFreshSignIn, markFreshSignIn } from './utils/authOutcome.ts';
import { hasCompletedOnboarding, ONBOARDING_COMPLETE_KEY } from './utils/onboardingStatus.ts';
import { PROFILE_NAME_KEY, resolveGreetingName } from './utils/greetingName.ts';
import { whatsappService, WhatsAppEvent } from './services/whatsappService.ts';
import { orderBelongsTo, ownedOrdersOnly } from './utils/orderOwnership.ts';
import WalkthroughTour, { WALKTHROUGH_STORAGE_KEY, isWalkthroughCompleted, WalkthroughTourHandle } from './components/Walkthrough/WalkthroughTour.tsx';
import { demoStateForTourStep, tourStepForDemoState } from './components/Walkthrough/tourSteps.js';
import type { DemoOrderStep } from './components/Walkthrough/VirtualDemoOrderCard.tsx';

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
  // The translator is needed here, not only in the screens: the bottom-bar labels
  // are built by `resolveTabsFromBusinessType`, which used to return English
  // literals and so never followed a language change.
  const { t, applyRemoteLanguage, markLanguageResolved } = useLanguage();
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
  const newOrderForPopupRef = useRef<Order | null>(null);
  useEffect(() => { newOrderForPopupRef.current = newOrderForPopup; }, [newOrderForPopup]);
  const [isInteractionDone, setInteractionDone] = useState(false);
  const [isOtherModalShowing, setIsOtherModalShowing] = useState(false);
  const { products, updateProduct, loadProducts } = useProducts();
  const ordersRef = useRef(orders);
  const productsRef = useRef(products);
  // A second click must not run the stock arithmetic or the cloud write twice.
  const statusUpdateInFlightRef = useRef(false);
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
  // False until the first poll of this account has been folded in. That first
  // poll sees the whole backlog, so it must elect nobody — see orderPolling.ts.
  const pollPrimedRef = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [welcomeBackName, setWelcomeBackName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);


  // Read once at boot. When a confirmation link is the reason this page loaded,
  // the shell is replaced by EmailConfirmScreen — the token is single-use, so
  // reading it in a lazy initializer is also what keeps a re-render from
  // re-reading it. `captureEmailConfirmParams` also wipes the token out of the
  // address bar immediately, instead of leaving it on screen for the length of
  // the network round trip.
  const [emailConfirmParams, setEmailConfirmParams] = useState<ConfirmParams | null>(
    captureEmailConfirmParams
  );
  const [authUrlError] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : getAuthUrlError()
  );

  // Surface any auth link errors (e.g. invalid or expired email confirmation link)
  useEffect(() => {
    const authError = getAuthUrlError();
    if (authError) {
      setError(authError);
    }
  }, []);

  // Auth state with local storage caching for immediate session persistence across page loads
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [settingsSubScreen, setSettingsSubScreen] = useState<string | null>(null);
  const [isWalkthroughActive, setIsWalkthroughActive] = useState<boolean>(false);
  const [demoStep, setDemoStep] = useState<DemoOrderStep>('new_order');
  const walkthroughRef = useRef<WalkthroughTourHandle>(null);
  // One automatic eligibility check per page load, however many auth re-renders fire.
  const walkthroughGateRef = useRef<'idle' | 'checking' | 'started'>('idle');
  // Opened from the consent line on the sign-in sheet, which renders over the
  // modal rather than replacing the app.
  const [showPrivacy, setShowPrivacy] = useState(false);
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
    return resolveTabsFromBusinessType(category, aiContext, t);
  });

  // Re-resolve tabs once onboarding completes (category may have just been
  // written) and whenever the language changes — `t` is a new function when the
  // translations load, so the labels are rebuilt in the chosen language.
  useEffect(() => {
    const category = localStorage.getItem('dukan-store-category');
    const aiContext = localStorage.getItem('dukan-business-intelligence-context');
    setTabs(resolveTabsFromBusinessType(category, aiContext, t));
  }, [showOnboarding, t]);

  // Listen to Auth State and sync data to/from Supabase backend
  useEffect(() => {
    const unsubscribe = listenToAuthState(async (user, report) => {
      /**
       * An UNCONFIRMED "no user yet" answer is not a sign-out.
       *
       * The shell boots from the cached identity, and a session check that has
       * not resolved yet can answer "null" after the page has painted as signed
       * in. Treating that as a sign-out made ownership drop the cache and
       * hard-reload the page underneath an order popup — the shopkeeper watched
       * the popup appear and vanish for no visible reason. Only a session the
       * server accepted, or an explicit SIGNED_OUT, carries that proof.
       */
      const confirmed = report?.confirmed !== false;
      if (!user && !confirmed) return;

      setCurrentUser(user);
      currentUserRef.current = user;
      if (!user) {
        // A confirmed sign-out leaves this device on its stored language; there
        // is no account left to restore from.
        markLanguageResolved();
      }

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
        // Never reload while a sign-in is mid-flight: the "no session yet" that
        // dropped this cache may simply be the exchange not having finished, and
        // reloading there is what made the Google flow look like a refresh loop.
        const signInInFlight = isOAuthPending() || window.location.search.includes('code=');
        if (import.meta.env.DEV) {
          // Deliberately noisy: this exact decision is the one that used to
          // reload the page while Google was still signing the user in.
          console.debug('[auth-flow] ownership drop', { signInInFlight, hasUser: Boolean(user) });
        }
        if (!signInInFlight && claimOwnershipReboot()) {
          // A reload destroys the React tree, taking an order popup with it.
          // The cache has already been dropped, so the caller re-hydrates
          // below; defer the reload while a shopkeeper is answering an order.
          if (newOrderForPopupRef.current) {
            console.warn('[auth-flow] ownership drop while an order popup is open — deferring reload');
          } else {
            window.location.reload();
            return;
          }
        }
      }

      if (user) {
        setShowAuthModal(false); // Close modal on successful authentication
        localStorage.removeItem('dukan-guest-mode');
        localStorage.removeItem('dukan-oauth-in-progress');

        // Telemetry, one row per app load. None of these calls is awaited: the
        // Supabase dashboard is their only reader and none may delay the shopkeeper.
        void syncDeviceSessionOnceForAppLoad();
        void syncUserIdentityOnceForAppLoad();

        // Restore store data from Supabase DB or migrate existing local store to cloud with user ID
        const cloudData = await syncOnLogin(ordersRef.current, productsRef.current, user);

        // Adopt the account's language BEFORE the boot-time preferences write.
        // The other order wrote this device's default English over the stored
        // choice, which is why a Hindi user kept finding English again.
        applyRemoteLanguage(cloudData.language ?? cloudData.profile?.preferredLanguage ?? null);
        void syncMerchantPreferencesOnceForAppLoad();
        if (cloudData.orders && cloudData.orders.length > 0) {
          setOrders(cloudData.orders);
        }
        if (cloudData.products && cloudData.products.length > 0) {
          loadProducts(cloudData.products);
        }
        if (cloudData.profile) {
          if (cloudData.profile.preferredLanguage) {
            localStorage.setItem('dukan-language', cloudData.profile.preferredLanguage);
          }
          if (cloudData.profile.storeDetails?.storeName) {
            localStorage.setItem('dukan-store-name', cloudData.profile.storeDetails.storeName);
          }
          if (cloudData.profile.storeDetails?.category) {
            localStorage.setItem('dukan-store-category', cloudData.profile.storeDetails.category);
          }
          if (cloudData.profile.storeDetails?.storeAddress && !localStorage.getItem('dukan-store-address')) {
            localStorage.setItem('dukan-store-address', cloudData.profile.storeDetails.storeAddress);
          }
          if (cloudData.profile.storeDetails?.supplierName && !localStorage.getItem('dukan-supplier-name')) {
            localStorage.setItem('dukan-supplier-name', cloudData.profile.storeDetails.supplierName);
          }
          if (cloudData.profile.storeDetails?.supplierWhatsapp && !localStorage.getItem('dukan-supplier-whatsapp')) {
            localStorage.setItem('dukan-supplier-whatsapp', cloudData.profile.storeDetails.supplierWhatsapp);
            localStorage.setItem('dukan-supplier-whatsapp-display', cloudData.profile.storeDetails.supplierWhatsapp);
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
          // Same for the store's position: restore it so a new device does not
          // have to ask the shopkeeper to stand in the shop again.
          if (cloudData.profile.storeLocation && !hasStoreLocation()) {
            saveStoreLocation(cloudData.profile.storeLocation);
          }
          const cat = localStorage.getItem('dukan-store-category');
          const aiCtx = localStorage.getItem('dukan-business-intelligence-context');
          setTabs(resolveTabsFromBusinessType(cat, aiCtx, t));
        }

        // The account's language is now adopted and the catalogue is restored,
        // so insights may start. Waiting for the 10-second safety timer made a
        // first-time shopkeeper watch an error card through the whole of
        // onboarding and only see insights after a manual refresh.
        markLanguageResolved();

        // An account that has already onboarded goes straight in — onboarding
        // is only for stores that have never been set up. The fresh-sign-in
        // marker is one-shot, so a silent session restore stays silent.
        const freshSignIn = consumeFreshSignIn();
        if (hasCompletedOnboarding(cloudData.profile)) {
          localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
          setShowOnboarding(false);
          if (freshSignIn) {
            setWelcomeBackName(resolveGreetingName({
              localName: localStorage.getItem(PROFILE_NAME_KEY),
              cloudName: cloudData.profile?.ownerName,
              user,
            }));
          }
        } else {
          setWelcomeBackName(null);
          setShowOnboarding(true);
        }
      }
    });
    return () => unsubscribe();
  }, [loadProducts]);

  // Safety net for a stalled restore: insights must not wait forever for a
  // language that is never going to arrive. Ten seconds is longer than any
  // healthy profile sync.
  useEffect(() => {
    const id = setTimeout(markLanguageResolved, 10000);
    return () => clearTimeout(id);
  }, [markLanguageResolved]);

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
        let isOAuthInProgress = isOAuthPending();
        // The flag is set just before redirecting to Google. Coming back without
        // OAuth parameters means the consent screen was abandoned, and leaving
        // the flag set would suppress the sign-in prompt on every later load.
        if (isOAuthInProgress && !hasOAuthParams) {
            clearOAuthPending();
            isOAuthInProgress = false;
        }

        const isAuthenticated = Boolean(currentUserRef.current || localStorage.getItem('dukan-auth-user'));

        // Returning from Google OAuth is an interactive sign-in, so the
        // welcome-back popup may fire once auth resolves.
        if (hasOAuthParams || isOAuthInProgress) {
            markFreshSignIn();
        }

        if (isOrdersRoute || hasOAuthParams || isOAuthInProgress) {
            // The OAuth callback still owns the language decision; the auth
            // listener resolves it when the session arrives.
            if (!hasOAuthParams && !isOAuthInProgress) markLanguageResolved();
            setInteractionDone(true);
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
        markLanguageResolved();
        if (!authChecked.current) {
            authChecked.current = true;
            setShowAuthModal(true);
        }
    } catch (error) {
        console.error("Failed to check onboarding status from localStorage", error);
        markLanguageResolved();
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

  const newOrderCount = orders.filter(o => isNewOrder(o.status)).length;

  const handleNavigation = useCallback((screen: Screen) => {
    setActiveScreen(screen);
  }, []);

  const handleModalStateChange = useCallback((isOpen: boolean) => {
    setIsOtherModalShowing(isOpen);
  }, []);

  /**
   * Applies one order's lines to stock in a single pass.
   *
   * Summing per product first is what makes this correct: two lines of the same
   * item used to overwrite each other, because every line looked up the same
   * pre-change snapshot of `products` and wrote its own answer over the previous
   * one. `direction` is -1 for an accepted order and +1 for a cancelled one, and
   * the context floors the result at zero either way.
   */
  const applyStockDelta = useCallback((items: OrderItem[], direction: 1 | -1) => {
    const perProduct = new Map<string, { product: Product; total: number }>();

    for (const item of items) {
        const product = products.find(p => p.id === item.productId || p.name.toLowerCase() === item.name.toLowerCase());
        if (!product) continue;
        const quantity = normalizeQuantity(item.quantity);
        const existing = perProduct.get(product.id);
        if (existing) existing.total += quantity;
        else perProduct.set(product.id, { product, total: quantity });
    }

    for (const { product, total } of perProduct.values()) {
        updateProduct({ ...product, stock: product.stock + direction * total });
    }
  }, [products, updateProduct]);

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    if (statusUpdateInFlightRef.current) return;
    statusUpdateInFlightRef.current = true;
    try {
      const orderToUpdate = orders.find(o => o.id === orderId);

      // A finished order stays finished. The New Order popup keeps a 60-second
      // auto-reject timer; after a delivery it used to fire anyway and send the
      // customer a "declined" message for an order they had already received.
      // Refusing every transition out of a final status is the one choke point.
      if (orderToUpdate && isFinalOrderStatus(orderToUpdate.status)) {
          return;
      }

      // MCP orders live in Supabase, not in the WhatsApp engine. Write the status
      // there first; only then move the local row. A failed write must not leave
      // the dashboard claiming an acceptance the customer cannot see.
      const isMcpOrder = orderId.startsWith('MCP-');
      if (isMcpOrder && orderToUpdate && orderToUpdate.status !== status) {
          const saved = await updateOrderStatusInCloud(orderId, status, orderToUpdate.status);
          if (!saved) {
              setError('This order changed elsewhere. Refresh and try again.');
              return;
          }
      }

      // If an order is accepted (moved from NEW to PREPARING), update inventory and notify customer on WhatsApp
      if (orderToUpdate && orderToUpdate.status === OrderStatus.NEW && status === OrderStatus.PREPARING) {
          applyStockDelta(orderToUpdate.items, -1);

          // Trigger real WhatsApp confirmation message via Baileys backend
          if (!isMcpOrder) {
              whatsappService.acceptOrder(orderId).catch(err => {
                  console.error('[WhatsAppService] Failed to notify customer of order acceptance:', err);
              });
          }
      } else if (orderToUpdate && status === OrderStatus.READY_FOR_PICKUP) {
          // Trigger doorstep / at pickup notification to customer via WhatsApp
          if (!isMcpOrder) {
              whatsappService.readyOrder(orderId).catch(err => {
                  console.error('[WhatsAppService] Failed to notify customer of doorstep arrival:', err);
              });
          }
      } else if (orderToUpdate && status === OrderStatus.COMPLETED) {
          // Trigger delivery completion message and persist COMPLETED in backend store
          if (!isMcpOrder) {
              whatsappService.deliverOrder(orderId).catch(err => {
                  console.error('[WhatsAppService] Failed to notify customer of order delivery:', err);
              });
          }
      } else if (orderToUpdate && status === OrderStatus.REJECTED) {
          // Trigger real WhatsApp rejection message via Baileys backend
          if (!isMcpOrder) {
              whatsappService.rejectOrder(orderId).catch(err => {
                  console.error('[WhatsAppService] Failed to notify customer of order rejection:', err);
              });
          }
      } else if (orderToUpdate && status === OrderStatus.CANCELLED) {
          // If an order is cancelled, restore the stock. This was the one piece of
          // stock arithmetic with no floor at all: a negative line quantity here
          // subtracted from stock instead of adding to it.
          applyStockDelta(orderToUpdate.items, 1);
      }

      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
      if (newOrderForPopup?.id === orderId) {
          setNewOrderForPopup(null);
      }
    } finally {
      statusUpdateInFlightRef.current = false;
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
        // A negative or non-numeric quantity from the shared backend would have
        // propagated into every stock calculation downstream.
        quantity: normalizeQuantity(item.quantity),
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
      userId: raw.userId ? String(raw.userId) : undefined,
    };
  }, []);

  // Sync real orders from WhatsApp backend on mount. The backend is shared by
  // many shops, so we ask for OUR account's orders only and, as defence in
  // depth, drop anything the response returns that isn't explicitly ours.
  useEffect(() => {
    const myId = currentUserRef.current?.id;
    if (!myId) return; // No account → no backend orders (guests stay local).

    whatsappService.fetchOrders().then(res => {
      if (res?.orders && res.orders.length > 0) {
        const backendOrders: Order[] = ownedOrdersOnly(
          res.orders.map((o: any) => normalizeIncomingOrder(o)).filter((o: Order) => Boolean(o.id)),
          myId,
        );
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
  }, [normalizeIncomingOrder, currentUser?.id]);

  // Real-time WhatsApp Baileys SSE listener + 2.5s robust polling fallback
  useEffect(() => {
    const unsubscribe = whatsappService.subscribeToEvents((event: WhatsAppEvent) => {
      if (event.type === 'dukan_new_order' && event.order) {
        const incomingOrder = normalizeIncomingOrder(event.order);
        if (!incomingOrder.id) return;

        // Shared backend: an event may concern another shop. Ignore anything
        // that isn't explicitly owned by the signed-in account.
        if (!orderBelongsTo(incomingOrder, currentUserRef.current?.id)) return;

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
        if (updated.id && orderBelongsTo(updated, currentUserRef.current?.id)) {
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

    // 2.5s polling fallback to ensure 100% delivery guarantee. Two sources:
    // the WhatsApp engine's local store, and Supabase (where MCP orders land).
    pollPrimedRef.current = false;
    const refreshOrders = async () => {
      const myId = currentUserRef.current?.id;
      if (!myId) return; // No account → nothing to reconcile.

      const [backend, cloud] = await Promise.all([
        whatsappService.fetchOrders().catch(() => ({ orders: [] })),
        fetchOrdersFromCloud(50).catch(() => null),
      ]);

      // Deduplicate by id. The backend row wins because it carries the
      // WhatsApp JID; a cloud row for the same id is the same order.
      const byId = new Map<string, any>();
      for (const order of [
        ...(Array.isArray(backend?.orders) ? backend.orders : []),
        ...(Array.isArray(cloud) ? cloud : []),
      ]) {
        if (!order) continue;
        const id = String(order.id || '');
        if (id && !byId.has(id)) byId.set(id, order);
      }

      const freshOrders: Order[] = ownedOrdersOnly(
        [...byId.values()].map((o: any) => normalizeIncomingOrder(o)).filter((o: Order) => Boolean(o.id)),
        myId,
      );

      // The SSE stream is the alerting path, but it can be slow or dropped
      // behind a proxy. The poll therefore also raises the popup — once per
      // order: `electPopupCandidates` elects nobody until the first poll has
      // been folded in, and records what it elected, so a fresh browser cannot
      // fire one chime per order for its whole backlog.
      //
      // Decided out here, not inside the state updater: React may run an
      // updater twice, and a chime or a popup is not idempotent.
      const { appeared } = mergePolledOrders(ordersRef.current, freshOrders);
      const electedIds = electPopupCandidates(appeared, seenOrderIds.current, pollPrimedRef.current);
      pollPrimedRef.current = true;

      if (electedIds.length > 0) {
        for (const id of electedIds) seenOrderIds.current.add(id);
        localStorage.setItem('dukan-seen-order-ids', JSON.stringify([...seenOrderIds.current]));

        playOrderChime();

        // Trigger popup unless suppressed by active subscreen or another open modal.
        if (activeScreenRef.current === Screen.SETTINGS || isOtherModalShowingRef.current) {
          console.log('[WhatsApp Order] Received new order, but popup suppressed due to active modal/screen.');
        } else {
          const first = appeared.find(o => electedIds.includes(o.id));
          if (first) setTimeout(() => setNewOrderForPopup(first), 0);
        }
      }

      setOrders(prev => {
        const merged = mergePolledOrders(prev, freshOrders);
        return merged.changed ? merged.orders : prev;
      });
    };

    void refreshOrders();
    const pollInterval = setInterval(refreshOrders, 2500);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [normalizeIncomingOrder]);

  const handleDemoAdvance = useCallback((next: DemoOrderStep) => {
    setDemoStep(next);
    if (!isWalkthroughActive) return;
    const stepIndex = tourStepForDemoState(next);
    if (stepIndex === null) return;
    if (next === 'completed') {
      // Let the completed card stay on screen before the tour moves on.
      window.setTimeout(() => walkthroughRef.current?.goToStep(stepIndex), 500);
    } else {
      walkthroughRef.current?.goToStep(stepIndex);
    }
  }, [isWalkthroughActive]);

  const handleTourStepChange = useCallback((index: number) => {
    setDemoStep(demoStateForTourStep(index));
  }, []);

  const startWalkthrough = useCallback(() => {
    try {
      localStorage.removeItem(WALKTHROUGH_STORAGE_KEY);
    } catch (_) {}
    setSettingsSubScreen(null);
    setDemoStep('new_order');
    setActiveScreen(Screen.DASHBOARD);
    window.setTimeout(() => setIsWalkthroughActive(true), 150);
  }, []);

  const maybeStartWalkthrough = useCallback(async () => {
    if (isWalkthroughCompleted()) return;
    const eligible = await isNewSignupForWalkthrough();
    if (!eligible) return;
    walkthroughGateRef.current = 'started';
    setDemoStep('new_order');
    window.setTimeout(() => setIsWalkthroughActive(true), 500);
  }, []);

  // The tour is compulsory for eligible accounts, so a reload mid-tour brings it
  // back instead of letting it be skipped. Eligibility is still the DB cutoff.
  useEffect(() => {
    if (!currentUser) return;
    if (localStorage.getItem(ONBOARDING_COMPLETE_KEY) !== 'true') return;
    if (showOnboarding || isWalkthroughActive) return;
    if (isWalkthroughCompleted()) return;
    if (walkthroughGateRef.current !== 'idle') return;
    walkthroughGateRef.current = 'checking';
    void maybeStartWalkthrough();
  }, [currentUser, showOnboarding, isWalkthroughActive, maybeStartWalkthrough]);

  const renderScreen = () => {
    switch (activeScreen) {
      case Screen.DASHBOARD:
        return <DashboardScreen orders={orders} onModalStateChange={handleModalStateChange} onAddOrders={handleAddOrders} />;
      case Screen.SALES:
        return <SalesScreen orders={orders} />;
      case Screen.ORDERS:
        return <OrdersScreen 
            orders={orders} 
            onUpdateStatus={handleUpdateStatus} 
            onModalStateChange={handleModalStateChange} 
            isWalkthroughActive={isWalkthroughActive}
            demoStep={demoStep}
            onDemoAdvance={handleDemoAdvance}
          />;
      case Screen.CATALOG:
        return <CatalogScreen onModalStateChange={handleModalStateChange} />;
      case Screen.SETTINGS:
        return (
          <SettingsScreen 
            onModalStateChange={handleModalStateChange} 
            onLogout={handleLogout}
            currentUser={currentUser}
            onOpenAuth={() => setShowAuthModal(true)}
            initialSubScreen={settingsSubScreen}
            onStartWalkthrough={startWalkthrough}
          />
        );
      default:
        return <DashboardScreen orders={orders} onModalStateChange={handleModalStateChange} onAddOrders={handleAddOrders} />;
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setWelcomeBackName(null);
    setInteractionDone(true); // Start simulation engine after onboarding

    // Re-resolve tabs now that category is written to localStorage
    const category = localStorage.getItem('dukan-store-category');
    const aiContext = localStorage.getItem('dukan-business-intelligence-context');
    setTabs(resolveTabsFromBusinessType(category, aiContext, t));
    // The tour starts from the resume effect once onboarding is out of the way,
    // so completing onboarding and reloading mid-tour share one entry point.
  };

  const handleLogout = useCallback(async () => {
    await signOutUser();
    // The install id identifies this browser, not the account that just left, so
    // it has to outlive the logout — otherwise every logout looks like a brand
    // new device and fragments the device-level telemetry.
    const installId = getInstallId();
    // Same reasoning for the language: wiping it made the app snap back to
    // English the moment the user signed out. The "chosen here" marker is NOT
    // restored, so the next account on this device still adopts its own saved
    // language.
    let language = 'en';
    try { language = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'; } catch { /* storage gone */ }
    clearLocalStore();
    localStorage.setItem('dukan-install-id', installId);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* storage gone */ }
    setCurrentUser(null);
    currentUserRef.current = null;
    setShowAuthModal(true);
  }, []);

  // A confirmation link owns the page it landed on: render the confirmation
  // screen instead of the app, so no "Sync Your Store" modal appears over it.
  if (emailConfirmParams) {
    return (
      <EmailConfirmScreen
        params={emailConfirmParams}
        authError={authUrlError}
        onContinue={() => {
          // Drop the spent token from the URL so a reload cannot replay it.
          window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
          setEmailConfirmParams(null);
        }}
      />
    );
  }

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
        {welcomeBackName && (
          <WelcomeBackModal name={welcomeBackName} onContinue={() => setWelcomeBackName(null)} />
        )}
        {showAuthModal && (
          <AuthModal 
            onSuccess={() => setShowAuthModal(false)} 
            onOpenPrivacy={() => setShowPrivacy(true)}
          />
        )}
        {showPrivacy && (
          <div className="fixed inset-0 z-[110] bg-black overflow-y-auto">
            <PrivacyPolicyScreen onBack={() => setShowPrivacy(false)} />
          </div>
        )}
        {error && <Toast message={error} onClose={() => setError(null)} />}
        <WalkthroughTour
          ref={walkthroughRef}
          activeScreen={activeScreen}
          onNavigate={handleNavigation}
          isTourActive={isWalkthroughActive && !showOnboarding && !showAuthModal && !newOrderForPopup && !welcomeBackName}
          onTourEnd={() => {
            setIsWalkthroughActive(false);
            setSettingsSubScreen(null);
            setDemoStep('new_order');
          }}
          onStepChange={handleTourStepChange}
          onSetSettingsSubScreen={setSettingsSubScreen}
        />
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
