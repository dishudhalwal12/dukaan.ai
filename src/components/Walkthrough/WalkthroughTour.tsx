import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { driver, Driver, DriveStep, Side, Alignment } from 'driver.js';
import UseAnimations from 'react-useanimations';
import type { Animation } from 'react-useanimations';
import barChart from 'react-useanimations/lib/barChart';
import dollarSign from 'react-useanimations/lib/dollarSign';
import zap from 'react-useanimations/lib/zap';
import packageIcon from 'react-useanimations/lib/package';
import creditCard from 'react-useanimations/lib/creditCard';
import tag from 'react-useanimations/lib/tag';
import user from 'react-useanimations/lib/user';
import { Screen } from '../../types.ts';
import { useLanguage } from '../../contexts/LanguageContext.tsx';
import { TOUR_STEPS, TOUR_STEP_COUNT } from './tourSteps.js';
import { TourFocusRing } from './TourFocusRing.tsx';

export const WALKTHROUGH_STORAGE_KEY = 'dukan-walkthrough-completed';

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

const TOUR_ICONS: Record<string, Animation> = {
  barChart,
  dollarSign,
  zap,
  package: packageIcon,
  creditCard,
  tag,
  user,
};

const STAGE_PADDING = 5;

export interface WalkthroughTourHandle {
  goToStep: (index: number) => void;
  isActive: () => boolean;
}

export interface WalkthroughTourProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  isTourActive: boolean;
  onTourEnd: () => void;
  onSetSettingsSubScreen?: (subScreen: string | null) => void;
  onStepChange?: (index: number) => void;
}

export const WalkthroughTour = forwardRef<WalkthroughTourHandle, WalkthroughTourProps>(
  ({ activeScreen, onNavigate, isTourActive, onTourEnd, onSetSettingsSubScreen, onStepChange }, ref) => {
    const { t } = useLanguage();
    const driverRef = useRef<Driver | null>(null);
    const iconRootRef = useRef<Root | null>(null);
    const transitionTokenRef = useRef(0);
    const finishedRef = useRef(false);

    // React refuses a synchronous unmount while it is rendering, and driver can
    // repaint its popover mid-render. Deferring by a tick keeps the console clean.
    const unmountIconRoot = useCallback((root: Root | null) => {
      if (!root) return;
      window.setTimeout(() => {
        try {
          root.unmount();
        } catch (_) {}
      }, 0);
    }, []);

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

    const onStepChangeRef = useRef(onStepChange);
    useEffect(() => {
      onStepChangeRef.current = onStepChange;
    }, [onStepChange]);

    const tRef = useRef(t);
    useEffect(() => {
      tRef.current = t;
    }, [t]);

    const handleFinish = useCallback(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      markWalkthroughCompleted();
      onSetSettingsSubScreenRef.current?.(null);
      onNavigateRef.current(Screen.DASHBOARD);
      onTourEndRef.current();
    }, []);

    /** Waits for the destination screen (and sub-screen) to paint its target. */
    const waitForTarget = useCallback(async (selector: string, timeout = 700) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        if (document.querySelector(selector)) return;
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
    }, []);

    const handleStepTransition = useCallback(
      async (targetIndex: number, currentDriver: Driver) => {
        if (targetIndex < 0 || targetIndex >= TOUR_STEP_COUNT) {
          handleFinish();
          currentDriver.destroy();
          return;
        }
        // A duplicate request for the step already on screen is a no-op. Driver
        // updates its index synchronously, so this also absorbs a fast double
        // click without needing a timer-based lock.
        if (currentDriver.getActiveIndex() === targetIndex) return;

        const token = ++transitionTokenRef.current;
        const meta = TOUR_STEPS[targetIndex];

        onStepChangeRef.current?.(targetIndex);
        onSetSettingsSubScreenRef.current?.(meta.subScreen ?? null);

        if (meta.screen !== activeScreenRef.current) {
          onNavigateRef.current(meta.screen as Screen);
        }

        await waitForTarget(meta.element);
        if (token !== transitionTokenRef.current) return;

        try {
          currentDriver.moveTo(targetIndex);
        } catch (err) {
          console.warn('[Walkthrough] Could not move to step', targetIndex, err);
        }
      },
      [handleFinish, waitForTarget]
    );

    useImperativeHandle(
      ref,
      () => ({
        goToStep: (index: number) => {
          const currentDriver = driverRef.current;
          if (!currentDriver || !currentDriver.isActive()) return;
          void handleStepTransition(index, currentDriver);
        },
        isActive: () => Boolean(driverRef.current?.isActive()),
      }),
      [handleStepTransition]
    );

    useEffect(() => {
      if (!isTourActive) {
        if (driverRef.current) {
          try {
            driverRef.current.destroy();
          } catch (_) {}
          driverRef.current = null;
        }
        const previousRoot = iconRootRef.current;
        iconRootRef.current = null;
        unmountIconRoot(previousRoot);
        return;
      }

      finishedRef.current = false;
      transitionTokenRef.current += 1;

      const renderIcon = (popover: { title: HTMLElement }, index: number) => {
        const previousRoot = iconRootRef.current;
        iconRootRef.current = null;
        unmountIconRoot(previousRoot);

        const meta = TOUR_STEPS[index];
        const animation = TOUR_ICONS[meta.icon];
        popover.title.innerHTML = '';

        const iconHost = document.createElement('span');
        iconHost.className = 'dukaan-tour-icon';
        const label = document.createElement('span');
        label.className = 'dukaan-tour-label';
        label.textContent = tRef.current(meta.titleKey);
        popover.title.appendChild(iconHost);
        popover.title.appendChild(label);

        if (animation) {
          const root = createRoot(iconHost);
          root.render(
            <UseAnimations
              animation={animation}
              interaction="loop"
              size={20}
              strokeColor="#E6E6FA"
            />
          );
          iconRootRef.current = root;
        }
      };

      const driverSteps: DriveStep[] = TOUR_STEPS.map((meta, index) => {
        const isLast = index === TOUR_STEP_COUNT - 1;
        return {
          element: meta.element,
          popover: {
            title: tRef.current(meta.titleKey),
            description: tRef.current(meta.descriptionKey),
            side: meta.side as Side,
            align: meta.align as Alignment,
            showProgress: true,
            progressText: tRef.current('tour_progress', {
              current: index + 1,
              total: TOUR_STEP_COUNT,
            }),
            nextBtnText: isLast ? tRef.current('tour_done') : tRef.current('tour_next'),
            prevBtnText: tRef.current('tour_back'),
            doneBtnText: tRef.current('tour_done'),
            onNextClick: (_element, _step, opts) => {
              if (isLast) {
                handleFinish();
                opts.driver.destroy();
                if (driverRef.current === opts.driver) driverRef.current = null;
              } else {
                void handleStepTransition(index + 1, opts.driver);
              }
            },
            onPrevClick: (_element, _step, opts) => {
              if (index > 0) void handleStepTransition(index - 1, opts.driver);
            },
          },
        };
      });

      let instance: Driver;
      instance = driver({
        animate: true,
        allowClose: false,
        allowKeyboardControl: true,
        overlayColor: 'rgba(0, 0, 0, 0.78)',
        stagePadding: STAGE_PADDING,
        stageRadius: 14,
        popoverClass: 'dukaan-tour-popover',
        popoverOffset: 12,
        steps: driverSteps,
        onPopoverRender: (popover, opts) => {
          const index = opts.state.activeIndex;
          if (typeof index === 'number' && TOUR_STEPS[index]) {
            renderIcon(popover, index);
          }
        },
        onDestroyStarted: () => {
          handleFinish();
          try {
            instance.destroy();
          } catch (_) {}
          if (driverRef.current === instance) driverRef.current = null;
        },
      });

      driverRef.current = instance;
      onSetSettingsSubScreenRef.current?.(null);
      onStepChangeRef.current?.(0);

      let cancelled = false;
      void (async () => {
        const firstStep = TOUR_STEPS[0];
        if (firstStep.screen !== activeScreenRef.current) {
          onNavigateRef.current(firstStep.screen as Screen);
        }
        await waitForTarget(firstStep.element);
        if (cancelled) return;
        try {
          instance.drive(0);
        } catch (err) {
          console.warn('[Walkthrough] Failed to start tour:', err);
        }
      })();

      return () => {
        cancelled = true;
        transitionTokenRef.current += 1;
        try {
          instance.destroy();
        } catch (_) {}
        if (driverRef.current === instance) driverRef.current = null;
        const previousRoot = iconRootRef.current;
        iconRootRef.current = null;
        unmountIconRoot(previousRoot);
      };
    }, [isTourActive, handleFinish, handleStepTransition, unmountIconRoot, waitForTarget]);

    if (!isTourActive) return null;
    return <TourFocusRing getDriver={() => driverRef.current} padding={STAGE_PADDING} />;
  }
);

WalkthroughTour.displayName = 'WalkthroughTour';

export default WalkthroughTour;
