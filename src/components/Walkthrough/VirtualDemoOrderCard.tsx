import React, { useState, useRef, useCallback, useEffect } from 'react';
import { playOrderChime } from '../../utils/audioAlert.ts';
import { WhatsAppIcon } from '../Icons.tsx';

export type DemoOrderStep = 'new_order' | 'order_details' | 'scan_to_pay' | 'completed';

interface VirtualDemoOrderCardProps {
  onTourAdvance?: () => void;
}

export const VirtualDemoOrderCard: React.FC<VirtualDemoOrderCardProps> = ({ onTourAdvance }) => {
  const [currentStep, setCurrentStep] = useState<DemoOrderStep>('new_order');
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const sliderRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const handleAcceptSwipe = useCallback(() => {
    playOrderChime();
    setCurrentStep('order_details');
    setSwipeOffset(0);
  }, []);

  const handleAtPickup = useCallback(() => {
    playOrderChime();
    setCurrentStep('scan_to_pay');
  }, []);

  const handlePaymentDone = useCallback(() => {
    playOrderChime();
    setCurrentStep('completed');
  }, []);

  const handleReset = useCallback(() => {
    setCurrentStep('new_order');
    setSwipeOffset(0);
  }, []);

  // Mouse & Touch Swipe handlers
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsSwiping(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isSwiping || !sliderRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const maxSwipe = sliderRef.current.offsetWidth - 56;
    const delta = Math.max(0, Math.min(clientX - startXRef.current, maxSwipe));
    setSwipeOffset(delta);

    if (delta >= maxSwipe * 0.7) {
      setIsSwiping(false);
      handleAcceptSwipe();
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);
    if (sliderRef.current && swipeOffset >= (sliderRef.current.offsetWidth - 56) * 0.7) {
      handleAcceptSwipe();
    } else {
      setSwipeOffset(0);
    }
  };

  return (
    <div 
      data-tour="orders-demo-container"
      className="w-full max-w-sm mx-auto transition-all"
    >
      {/* 1. NEW ORDER RECEIVED (SCREENSHOT 1) */}
      {currentStep === 'new_order' && (
        <div className="bg-[#1A1A1A] text-white rounded-2xl p-5 border border-neutral-800 shadow-2xl relative overflow-hidden">
          {/* Subtle countdown bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#2D2D2D]">
            <div className="h-full bg-[#E6E6FA] w-4/5 animate-pulse" />
          </div>

          <div className="mb-4 pt-1">
            <h3 className="text-lg font-bold text-white tracking-tight">New Order Received!</h3>
            <p className="text-sm font-normal text-neutral-400 truncate mt-0.5">
              Pulkit &bull; Mahima Sansaar, Tehsil, Sahara City Homes, P...
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-neutral-400 px-1 mb-2">Items</p>
              <div className="bg-[#2D2D2D] p-3.5 rounded-xl flex justify-between items-center">
                <div>
                  <p className="font-bold text-white text-sm">Tata Tea Premium (500g)</p>
                  <p className="text-xs text-neutral-400 mt-0.5">2 x ₹290</p>
                </div>
                <p className="font-bold text-white text-base">₹580.00</p>
              </div>
            </div>

            <div className="flex justify-between items-center bg-[#2D2D2D] p-3.5 rounded-xl">
              <div>
                <p className="font-bold text-white text-base">Total Bill</p>
                <p className="text-xs text-neutral-400 font-semibold mt-0.5">Payment: COD</p>
              </div>
              <p className="font-bold text-xl text-white">₹580.00</p>
            </div>

            <div className="pt-2 space-y-2.5">
              {/* Swipe to Accept Slider matching Screenshot 1 */}
              <div
                ref={sliderRef}
                className="relative w-full bg-[#2D2D2D] rounded-full h-14 flex items-center justify-center overflow-hidden select-none"
                onMouseMove={handleTouchMove}
                onMouseUp={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <p 
                  className="text-neutral-300 font-semibold z-10 pointer-events-none transition-opacity duration-200"
                  style={{ opacity: Math.max(0.1, 1 - swipeOffset / 100) }}
                >
                  Swipe to Accept
                </p>

                {/* Pulsing Guide Arrow indicating direction */}
                {swipeOffset === 0 && (
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1 opacity-70 animate-pulse">
                    <span className="material-symbols-outlined text-lg text-neutral-400">arrow_forward</span>
                  </div>
                )}

                {/* Handle */}
                <div
                  ref={handleRef}
                  onMouseDown={handleTouchStart}
                  onTouchStart={handleTouchStart}
                  style={{ transform: `translateX(${swipeOffset}px)` }}
                  className="absolute top-0 left-0 h-full w-14 bg-[#E6E6FA] rounded-full flex items-center justify-center z-20 cursor-grab active:cursor-grabbing shadow-[0_0_16px_rgba(230,230,250,0.3)] transition-transform duration-75"
                >
                  <span className="material-symbols-outlined text-black font-bold">chevron_right</span>
                </div>
              </div>

              {/* Instant Click Fallback for desktop mouse */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={handleAcceptSwipe}
                  className="text-xs text-[#E6E6FA] hover:text-white font-semibold underline underline-offset-2"
                >
                  Click to simulate swipe &rarr;
                </button>
                <button
                  type="button"
                  onClick={handleAcceptSwipe}
                  className="text-xs text-neutral-500 hover:text-neutral-400"
                >
                  Decline Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. ORDER DETAILS (SCREENSHOT 2) */}
      {currentStep === 'order_details' && (
        <div className="bg-[#1A1A1A] text-white rounded-2xl p-5 border border-neutral-800 shadow-2xl animate-fadeIn">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white tracking-tight">Order DKN-1023</h3>
            <button 
              onClick={handleReset} 
              className="text-neutral-400 hover:text-white p-1"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Customer Box */}
            <div className="bg-[#2D2D2D] p-3.5 rounded-xl">
              <p className="text-xs text-neutral-400 font-medium">Customer</p>
              <p className="font-bold text-white text-base mt-0.5">Pulkit Khowal</p>

              {/* Address with Maps */}
              <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-lg bg-[#202020] border border-neutral-700">
                <div className="flex items-start gap-2 flex-1 pr-2">
                  <span className="material-symbols-outlined text-red-400 text-lg mt-0.5">pin_drop</span>
                  <span className="text-xs text-neutral-200 line-clamp-2 leading-relaxed">
                    Mahima Sansaar, Tehsil, Sahara City Homes, Plot No. GH-2, Village Bilwa...
                  </span>
                </div>
                <span className="text-[11px] font-bold bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 shrink-0">
                  Maps <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                </span>
              </div>

              {/* Chat on WhatsApp */}
              <div className="mt-3">
                <span className="inline-flex items-center gap-2 bg-[#25D366] text-white text-xs font-bold py-1.5 px-3 rounded-full">
                  <WhatsAppIcon className="w-4 h-4" />
                  Chat on WhatsApp
                </span>
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-sm font-medium text-neutral-400 px-1 mb-2">Items</p>
              <div className="bg-[#2D2D2D] p-3.5 rounded-xl flex justify-between items-center">
                <div>
                  <p className="font-bold text-white text-sm">Tata Tea Premium (500g)</p>
                  <p className="text-xs text-neutral-400 mt-0.5">2 x ₹290</p>
                </div>
                <p className="font-bold text-white text-base">₹580.00</p>
              </div>
            </div>

            {/* Total Bill */}
            <div className="flex justify-between items-center bg-[#2D2D2D] p-3.5 rounded-xl">
              <div>
                <p className="font-bold text-white text-base">Total Bill</p>
                <p className="text-xs text-neutral-400 font-semibold mt-0.5">Payment: COD</p>
              </div>
              <p className="font-bold text-xl text-white">₹580.00</p>
            </div>

            {/* At pickup button */}
            <button
              type="button"
              onClick={handleAtPickup}
              className="w-full bg-[#E6E6FA] text-black font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(230,230,250,0.3)]"
            >
              <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
              At pickup
            </button>
          </div>
        </div>
      )}

      {/* 3. SCAN TO PAY MODAL (SCREENSHOT 3) */}
      {currentStep === 'scan_to_pay' && (
        <div className="bg-[#1A1A1A] text-white rounded-2xl p-6 border border-neutral-800 shadow-2xl animate-scaleUp">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-bold text-white tracking-tight">Scan to Pay</h3>
            <button 
              onClick={handleReset} 
              className="text-neutral-400 hover:text-white p-1"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="flex flex-col items-center space-y-4">
            {/* Visual Crisp QR Code */}
            <div className="bg-white p-4 rounded-2xl shadow-inner w-56 h-56 flex flex-col items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* QR Finder Corners */}
                <rect x="5" y="5" width="28" height="28" rx="4" fill="black" />
                <rect x="9" y="9" width="20" height="20" rx="2" fill="white" />
                <rect x="13" y="13" width="12" height="12" fill="black" />

                <rect x="67" y="5" width="28" height="28" rx="4" fill="black" />
                <rect x="71" y="9" width="20" height="20" rx="2" fill="white" />
                <rect x="75" y="13" width="12" height="12" fill="black" />

                <rect x="5" y="67" width="28" height="28" rx="4" fill="black" />
                <rect x="9" y="71" width="20" height="20" rx="2" fill="white" />
                <rect x="13" y="75" width="12" height="12" fill="black" />

                {/* Pattern Data Dots */}
                <rect x="38" y="10" width="6" height="6" fill="black" />
                <rect x="48" y="10" width="6" height="6" fill="black" />
                <rect x="42" y="22" width="6" height="6" fill="black" />
                <rect x="52" y="22" width="6" height="6" fill="black" />
                <rect x="10" y="42" width="6" height="6" fill="black" />
                <rect x="22" y="42" width="6" height="6" fill="black" />
                <rect x="16" y="52" width="6" height="6" fill="black" />
                <rect x="38" y="38" width="8" height="8" fill="black" />
                <rect x="54" y="38" width="8" height="8" fill="black" />
                <rect x="42" y="52" width="12" height="6" fill="black" />
                <rect x="68" y="42" width="6" height="6" fill="black" />
                <rect x="78" y="42" width="8" height="8" fill="black" />
                <rect x="68" y="56" width="10" height="6" fill="black" />
                <rect x="82" y="56" width="6" height="6" fill="black" />
                <rect x="38" y="68" width="6" height="6" fill="black" />
                <rect x="48" y="68" width="6" height="6" fill="black" />
                <rect x="42" y="78" width="8" height="8" fill="black" />
                <rect x="54" y="78" width="8" height="8" fill="black" />
                <rect x="68" y="68" width="12" height="6" fill="black" />
                <rect x="84" y="68" width="6" height="6" fill="black" />
                <rect x="72" y="80" width="8" height="8" fill="black" />
                <rect x="84" y="80" width="6" height="6" fill="black" />
              </svg>
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-normal text-neutral-400">Amount to be paid</p>
              <p className="text-3xl font-extrabold text-white tracking-tight">₹580.00</p>
              <p className="text-xs font-mono text-neutral-400">UPI ID: divyarth12@ybl</p>
            </div>

            <button
              type="button"
              onClick={handlePaymentDone}
              className="w-full bg-[#E6E6FA] text-black font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-98 transition-all shadow-[0_0_15px_rgba(230,230,250,0.3)]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 4. COMPLETED CONFIRMATION */}
      {currentStep === 'completed' && (
        <div className="bg-[#1A1A1A] text-white rounded-2xl p-6 border border-neutral-800 shadow-2xl text-center space-y-3 animate-scaleUp">
          <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-2xl">check_circle</span>
          </div>
          <h4 className="font-bold text-base text-white">Order Accepted &amp; Delivered!</h4>
          <p className="text-xs text-neutral-400">
            You&apos;ve experienced the full order lifecycle from WhatsApp alert to doorstep UPI collection.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-semibold text-neutral-400 hover:text-white underline underline-offset-2 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              Replay Demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VirtualDemoOrderCard;
