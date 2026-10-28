import React, { useEffect, useState } from 'react';
import { captureApproximateLocation, captureStoreLocation, StoreLocation } from '../utils/location.ts';
import { BRAND } from '../config/brand.ts';

interface LocationModalProps {
  isOpen: boolean;
  /**
   * `onboarding` offers "Setup later", because a shopkeeper who is not standing
   * in the shop right now must still be able to finish setting up.
   * `required` does not: the catalog cannot be filled from an unknown location.
   * `edit` is the same gate opened on purpose from Settings, so it offers a
   * plain "Back" instead of pretending something is missing.
   */
  mode: 'onboarding' | 'required' | 'edit';
  /**
   * Who is being asked. `store` is the shopkeeper during onboarding; `customer`
   * is the same sheet inside the MCP consent page, where the position is used to
   * find nearby shops in an AI chat rather than to place the shop on the map.
   * The visual language is deliberately identical: one location consent surface.
   */
  audience?: 'store' | 'customer';
  onCaptured: (location: StoreLocation) => void;
  onSetupLater?: () => void;
  onClose?: () => void;
}

const MESSAGES = {
  denied: 'Location is blocked. Turn it on for this site, then try again.',
  blocked_by_device:
    'This site is allowed, but your device is blocking the browser. Enable Chrome (or your browser) in System Settings → Privacy & Security → Location Services, then quit and reopen it. If it stays blocked, use an approximate location below.',
  unavailable: 'We could not find your location. Move near a window and try again.',
  timeout: 'Your location took too long. Please try again.',
  unsupported: 'This browser cannot share a location. Please try another browser.',
};

type LocationMessage = keyof typeof MESSAGES;

/**
 * One short line, one button, and the truth about why we want it.
 *
 * The copy is the consent notice: the exact position is stored, so the
 * shopkeeper is told that before anything is captured. Deliberately not
 * dismissible by tapping the backdrop — a decision is required, and a modal that
 * vanishes silently leaves no way to know whether the gate is now open.
 */
const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  mode,
  audience = 'store',
  onCaptured,
  onSetupLater,
  onClose,
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [failure, setFailure] = useState<LocationMessage | null>(null);

  // This component stays mounted while closed, so a failure from the previous
  // attempt would still be on screen the next time it opens — before the
  // shopkeeper has tried anything.
  useEffect(() => {
    if (isOpen) {
      setFailure(null);
      setIsLocating(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAllow = async () => {
    setIsLocating(true);
    setFailure(null);
    const attempt = await captureStoreLocation();
    setIsLocating(false);

    if (attempt.status === 'captured') {
      onCaptured(attempt.location);
      return;
    }
    setFailure(attempt.reason as LocationMessage);
  };

  const handleApproximate = async () => {
    setIsLocating(true);
    setFailure(null);
    const attempt = await captureApproximateLocation();
    setIsLocating(false);

    if (attempt.status === 'captured') {
      onCaptured(attempt.location);
      return;
    }
    setFailure('unavailable');
  };

  const isCustomer = audience === 'customer';
  const title = isCustomer
    ? 'Share your location?'
    : mode === 'required'
      ? 'Store location needed'
      : 'Store location';
  const subtitle = !isCustomer && mode === 'required' ? 'Add your products after setting your store location.' : null;
  const body = isCustomer
    ? `We save it to your ${BRAND.name} account so your assistant can name the nearest shop straight away. Delivery still needs a full address.`
    : "Stand inside your store and we'll save its exact location for setup.";
  const skipLabel = isCustomer ? 'Not now' : 'Setup later';
  const canDismiss = mode === 'required' || mode === 'edit';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1A1A1A] rounded-2xl p-6 max-w-sm w-full text-center shadow-lg">
        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2D2D2D]">
            <span className="material-symbols-outlined text-3xl text-[#E6E6FA]">location_on</span>
          </div>
        </div>

        <h2 className="text-white text-xl font-bold mb-2">{title}</h2>
        {subtitle && <p className="text-neutral-400 text-sm mb-3">{subtitle}</p>}

        <p className="text-neutral-300 text-sm mb-6">{body}</p>

        {failure && (
          <p className="text-neutral-400 text-xs mb-4 leading-relaxed">{MESSAGES[failure]}</p>
        )}

        <button
          onClick={handleAllow}
          disabled={isLocating}
          className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocating ? 'Getting location...' : failure ? 'Try again' : 'Allow location'}
        </button>

        {failure === 'blocked_by_device' && !isLocating && (
          <div className="mt-3">
            <button
              onClick={handleApproximate}
              className="w-full bg-[#2D2D2D] text-white font-semibold py-3 rounded-full text-sm hover:bg-neutral-700 transition-colors"
            >
              Use approximate location
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
              Uses your network's city instead of GPS. You can update the exact spot later in Settings.
            </p>
          </div>
        )}

        {mode === 'onboarding' && onSetupLater && (
          <button
            onClick={onSetupLater}
            className="w-full text-neutral-400 text-sm font-medium py-3 mt-1 hover:text-neutral-200 transition-colors"
          >
            {skipLabel}
          </button>
        )}

        {isCustomer && (
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
            Saved to your {BRAND.name} account only. You can update or remove it any time from this page.
            Approval is not required to share it.
          </p>
        )}

        {canDismiss && onClose && (
          <button
            onClick={onClose}
            className="w-full text-neutral-400 text-sm font-medium py-3 mt-1 hover:text-neutral-200 transition-colors"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
};

export default LocationModal;
