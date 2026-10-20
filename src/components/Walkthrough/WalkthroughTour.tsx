import React, { useEffect, useRef, useCallback } from 'react';
import { driver, Driver, DriveStep } from 'driver.js';
import { Screen } from '../../types.ts';

export const WALKTHROUGH_STORAGE_KEY = 'dukan-walkthrough-completed';
export const WALKTHROUGH_STATUS_KEY = 'dukan-walkthrough-completed';

export const isWalkthroughCompleted = (): boolean => {
  try {
    const val = localStorage.getItem(WALKTHROUGH_STORAGE_KEY);
    return val === 'completed' || val === 'true';
  } catch {
    return false;
  }
};

export const markWalkthroughCompleted = (): void => {
  try {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, 'completed');
  } catch (_) {}
};

export interface WalkthroughTourProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  isTourActive: boolean;
  onTourEnd: () => void;
  onSetSettingsSubScreen?: (subScreen: string | null) => void;
}

interface TourStepMeta {
  element: string;
  screen: Screen;
  subScreen?: string | null;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const TOUR_STEPS_META: TourStepMeta[] = [
  // 1. INSIGHT & ORDER ANALYTICS (DASHBOARD)
  {
    element: '[data-tour="dashboard-insights"]',
    screen: Screen.DASHBOARD,
    title: '📊 Analytics & Gemini AI Insights',
    description: 'Track your real-time daily orders, sales, and automated Gemini AI insights that predict low stock and suggest revenue growth tips.',
    side: 'bottom',
    align: 'center',
  },

  // 2. SALES SCREEN
  {
    element: '[data-tour="sales-filters"]',
    screen: Screen.SALES,
    title: '💰 Track Your Store Sales',
    description: 'Monitor your sales revenue, compare cashflow across Today, This Week, and This Month, and see payment breakdowns (UPI vs Cash).',
    side: 'bottom',
    align: 'center',
  },

  // 3. ORDERS SCREEN (EXACT UI DEMO)
  {
    element: '[data-tour="orders-demo-container"]',
    screen: Screen.ORDERS,
    title: '⚡ Interactive Orders Demo',
    description: 'Here’s how live WhatsApp orders work! Swipe the slider below to accept, tap ‘At pickup’ to dispatch, and collect payment with UPI QR.',
    side: 'top',
    align: 'center',
  },

  // 4. CATALOG SCREEN
  {
    element: '[data-tour="catalog-search-add"]',
    screen: Screen.CATALOG,
    title: '🏷️ Inventory, Suppliers & Unity',
    description: 'Manage your stock in real-time, add products, connect directly with suppliers for upstocking, and join Unity group deals for wholesale savings.',
    side: 'bottom',
    align: 'center',
  },

  // 5. PROFILE EDIT SCREEN
  {
    element: '[data-tour="edit-profile-tour"]',
    screen: Screen.SETTINGS,
    subScreen: 'profile',
    title: '👤 Complete Profile & Sync',
    description: 'Edit your store profile and contact details to keep everything synced with Dukaan.AI in real-time!',
    side: 'bottom',
    align: 'center',
  },
];

export const WalkthroughTour: React.FC<WalkthroughTourProps> = ({
  activeScreen,
  onNavigate,
  isTourActive,
  onTourEnd,
  onSetSettingsSubScreen,
}) => {
  const driverRef = useRef<Driver | null>(null);
  const activeScreenRef = useRef<Screen>(activeScreen);
  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  const onNavigateRef = useRef(onNavigate);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const onTourEndRef = useRef(onTourEnd);
  useEffect(() => {
    onTourEndRef.current = onTourEnd;
  }, [onTourEnd]);

  const onSetSettingsSubScreenRef = useRef(onSetSettingsSubScreen);
  useEffect(() => {
    onSetSettingsSubScreenRef.current = onSetSettingsSubScreen;
  }, [onSetSettingsSubScreen]);

  const handleFinish = useCallback(() => {
    markWalkthroughCompleted();
    onSetSettingsSubScreenRef.current?.(null);
    onNavigateRef.current(Screen.DASHBOARD);
    onTourEndRef.current();
  }, []);

  // Handle Step Navigation with Screen & Subscreen Switching
  const handleStepTransition = useCallback((targetIndex: number, currentDriver: Driver) => {
    if (targetIndex < 0 || targetIndex >= TOUR_STEPS_META.length) {
      currentDriver.destroy();
      return;
    }

    const nextMeta = TOUR_STEPS_META[targetIndex];
    const needsScreenChange = nextMeta.screen !== activeScreenRef.current;
    
    // Set subscreen if applicable
    onSetSettingsSubScreenRef.current?.(nextMeta.subScreen ?? null);

    if (needsScreenChange) {
      onNavigateRef.current(nextMeta.screen);
      setTimeout(() => {
        try {
          currentDriver.moveTo(targetIndex);
        } catch (e) {
          console.warn('[Walkthrough] Could not move to step', targetIndex, e);
        }
      }, 160);
    } else {
      setTimeout(() => {
        try {
          currentDriver.moveTo(targetIndex);
        } catch (e) {
          console.warn('[Walkthrough] Could not move to step', targetIndex, e);
        }
      }, 80);
    }
  }, []);

  useEffect(() => {
    if (!isTourActive) {
      if (driverRef.current) {
        try {
          driverRef.current.destroy();
        } catch (_) {}
        driverRef.current = null;
      }
      return;
    }

    // Build Driver.js steps from 5 metadata items
    const driverSteps: DriveStep[] = TOUR_STEPS_META.map((meta, index) => {
      const isLast = index === TOUR_STEPS_META.length - 1;
      return {
        element: meta.element,
        popover: {
          title: meta.title,
          description: meta.description,
          side: meta.side || 'bottom',
          align: meta.align || 'center',
          popoverClass: 'dukaan-tour-popover',
          showProgress: true,
          progressText: `Step ${index + 1} of ${TOUR_STEPS_META.length}`,
          nextBtnText: isLast ? 'Done 🚀' : 'Next →',
          prevBtnText: '← Back',
          doneBtnText: 'Done 🚀',
          onNextClick: (_el, _step, { driver: d }) => {
            if (isLast) {
              handleFinish();
              d.destroy();
            } else {
              handleStepTransition(index + 1, d);
            }
          },
          onPrevClick: (_el, _step, { driver: d }) => {
            if (index > 0) {
              handleStepTransition(index - 1, d);
            }
          },
        },
      };
    });

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayColor: 'rgba(0, 0, 0, 0.78)',
      stagePadding: 5,
      stageRadius: 14,
      popoverClass: 'dukaan-tour-popover',
      popoverOffset: 12,
      steps: driverSteps,
      onDestroyStarted: () => {
        handleFinish();
      },
    });

    driverRef.current = driverInstance;

    // Reset settings subscreen initially if on step 0
    onSetSettingsSubScreenRef.current?.(null);

    // Start tour on first step after brief DOM render tick
    const timer = setTimeout(() => {
      try {
        driverInstance.drive(0);
      } catch (err) {
        console.warn('[Walkthrough] Failed to drive tour:', err);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        try {
          driverRef.current.destroy();
        } catch (_) {}
        driverRef.current = null;
      }
    };
  }, [isTourActive, handleStepTransition, handleFinish]);

  return null;
};

export default WalkthroughTour;
