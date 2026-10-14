import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Order, OrderStatus } from '../types.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';

interface NewOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
}

const NewOrderModal: React.FC<NewOrderModalProps> = ({ isOpen, order, onUpdateStatus }) => {
  const [timeLeft, setTimeLeft] = useState(600); // 60s in tenths of a second
  const timerIntervalRef = useRef<number | null>(null);
  const { t } = useLanguage();

  // Swipe refs to avoid re-renders during swipe gesture
  const isSwipingRef = useRef(false);
  const swipeStartXRef = useRef(0);
  const swipeDeltaRef = useRef(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const onUpdateStatusRef = useRef(onUpdateStatus);
  useEffect(() => {
    onUpdateStatusRef.current = onUpdateStatus;
  }, [onUpdateStatus]);


  const handleCloseAndReject = useCallback(() => {
    if (order) {
        onUpdateStatusRef.current(order.id, OrderStatus.REJECTED);
    }
  }, [order]);

  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (isOpen) {
      mainElement?.classList.add('overflow-hidden');
      document.body.style.overscrollBehavior = 'contain';
    } else {
      mainElement?.classList.remove('overflow-hidden');
      document.body.style.overscrollBehavior = 'auto';
    }
    return () => {
      mainElement?.classList.remove('overflow-hidden');
      document.body.style.overscrollBehavior = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && order) {
      setTimeLeft(600); // Reset timer to 60 seconds

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      timerIntervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current!);
            handleCloseAndReject();
            return 0;
          }
          return prev - 1;
        });
      }, 100);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isOpen, order, handleCloseAndReject]);

  const getClientX = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): number =>
    'touches' in e ? e.touches[0].clientX : e.clientX, []);

  const handleSwipeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isSwipingRef.current) return;
    if (e.cancelable) e.preventDefault();

    const currentX = getClientX(e);
    let delta = currentX - swipeStartXRef.current;

    if (sliderRef.current && handleRef.current) {
        const sliderWidth = sliderRef.current.offsetWidth;
        const handleWidth = handleRef.current.offsetWidth;
        const maxSwipe = sliderWidth - handleWidth;
        delta = Math.max(0, Math.min(delta, maxSwipe));
        swipeDeltaRef.current = delta;
        handleRef.current.style.transform = `translateX(${delta}px)`;
        const textElement = sliderRef.current.querySelector('p');
        if (textElement) {
            const opacity = Math.max(0, 1 - (delta / (sliderWidth * 0.6)));
            textElement.style.opacity = `${opacity}`;
        }
    }
  }, [getClientX]);

  const handleSwipeEnd = useCallback(() => {
    window.removeEventListener('mousemove', handleSwipeMove);
    window.removeEventListener('touchmove', handleSwipeMove);
    window.removeEventListener('mouseup', handleSwipeEnd);
    window.removeEventListener('touchend', handleSwipeEnd);

    if (!isSwipingRef.current || !order) return;
    isSwipingRef.current = false;

    if (sliderRef.current && handleRef.current) {
        const acceptanceThreshold = sliderRef.current.offsetWidth * 0.5;
        if (swipeDeltaRef.current > acceptanceThreshold) {
            // Animate success then update
            if (handleRef.current && sliderRef.current) {
                const maxSwipe = sliderRef.current.offsetWidth - handleRef.current.offsetWidth;
                handleRef.current.style.transition = 'transform 0.2s ease-in';
                handleRef.current.style.transform = `translateX(${maxSwipe}px)`;
            }
            setTimeout(() => {
                onUpdateStatusRef.current(order.id, OrderStatus.PREPARING);
            }, 200);
        } else {
            // Animate back to start
            if (handleRef.current) {
                handleRef.current.style.transition = 'transform 0.3s ease-out';
                handleRef.current.style.transform = 'translateX(0px)';
            }
            const textElement = sliderRef.current.querySelector('p');
            if (textElement) {
                textElement.style.transition = 'opacity 0.3s ease-out';
                textElement.style.opacity = '1';
            }
        }
    }
  }, [order, handleSwipeMove]);

  const handleSwipeStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!order || isSwipingRef.current) return;
    
    if (handleRef.current) {
        handleRef.current.style.transition = 'none';
    }
     if (sliderRef.current) {
        const textElement = sliderRef.current.querySelector('p');
        if (textElement) {
            textElement.style.transition = 'none';
        }
    }
    swipeStartXRef.current = getClientX(e);
    isSwipingRef.current = true;
    swipeDeltaRef.current = 0;

    window.addEventListener('mousemove', handleSwipeMove);
    window.addEventListener('touchmove', handleSwipeMove, { passive: false });
    window.addEventListener('mouseup', handleSwipeEnd);
    window.addEventListener('touchend', handleSwipeEnd);
  }, [order, getClientX, handleSwipeMove, handleSwipeEnd]);

  useEffect(() => {
    return () => {
        if (isSwipingRef.current) {
            window.removeEventListener('mousemove', handleSwipeMove);
            window.removeEventListener('touchmove', handleSwipeMove);
            window.removeEventListener('mouseup', handleSwipeEnd);
            window.removeEventListener('touchend', handleSwipeEnd);
        }
    };
  }, [handleSwipeMove, handleSwipeEnd]);

  if (!isOpen || !order) return null;

  const customerFirstName = order.customer?.name?.split(' ')[0] ?? order.id;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
      />
      <div
        className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-[#1A1A1A] text-white rounded-t-2xl z-50 transform transition-transform duration-200 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-title"
      >
        {/* Timer bar — turns red in final 20% of countdown */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-[#2D2D2D] rounded-t-2xl overflow-hidden">
            <div
                className={`h-full transition-all duration-100 ease-linear ${
                    timeLeft < 120 ? 'bg-red-400' : 'bg-[#E6E6FA]'
                }`}
                style={{ width: `${(timeLeft / 600) * 100}%` }}
            />
        </div>
        
        <div className="p-6 pt-5">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 pr-2">
                <h3 id="new-order-title" className="text-lg font-bold text-white">
                  {t('new_order_received')}
                </h3>
                <p className="text-sm font-semibold text-neutral-400 truncate">{customerFirstName} &bull; {order.customer?.address ?? '—'}</p>
              </div>
              {/* Countdown in seconds */}
              <span className={`text-xs font-bold tabular-nums shrink-0 mt-0.5 ${timeLeft < 120 ? 'text-red-400' : 'text-neutral-500'}`}>
                {Math.ceil(timeLeft / 10)}s
              </span>
            </div>

            <div className="space-y-3">
                <div>
                    <p className="text-sm font-medium text-neutral-400 px-1 mb-2">{t('items')}</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
                        {order.items.map((item, index) => (
                            <div key={index} className="flex justify-between items-center bg-[#2D2D2D] p-2 rounded-lg">
                                <div className="flex-1 pr-2">
                                    <p className="font-semibold text-white truncate">{item.name}</p>
                                    <p className="text-sm text-neutral-400">{item.quantity} x {item.price}</p>
                                </div>
                                <p className="font-semibold text-neutral-200">₹{(item.quantity * parseFloat(String(item.price ?? '0').replace('₹', '') || '0')).toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between items-center bg-[#2D2D2D] p-3 rounded-lg">
                    <div>
                        <p className="font-bold text-white text-lg">{t('total_bill')}</p>
                        <p className="text-sm text-neutral-400 font-semibold">{t('payment')}: {order.paymentMethod}</p>
                    </div>
                    <p className="font-bold text-2xl text-[#E6E6FA]">₹{Number(order.total ?? 0).toFixed(2)}</p>
                </div>

                <div className="pt-2 space-y-3">
                  {/* Swipe-to-accept slider */}
                  <div
                    ref={sliderRef}
                    className="relative w-full bg-[#2D2D2D] rounded-full h-14 flex items-center justify-center overflow-hidden select-none"
                  >
                    <p className={`text-neutral-300 font-semibold z-10 transition-opacity duration-200 pointer-events-none`}>
                      {t('swipe_to_accept')}
                    </p>
                    <div
                      ref={handleRef}
                      className={`absolute top-0 left-0 h-full w-14 bg-[#E6E6FA] rounded-full flex items-center justify-center z-20 cursor-grab active:cursor-grabbing shadow-[0_0_16px_rgba(230,230,250,0.3)]`}
                      onMouseDown={handleSwipeStart}
                      onTouchStart={handleSwipeStart}
                    >
                      <span className="material-symbols-outlined text-black font-bold">chevron_right</span>
                    </div>
                  </div>
                  {/* Decline button */}
                  <button
                    onClick={handleCloseAndReject}
                    className="w-full py-3 text-sm font-semibold text-neutral-500 hover:text-red-400 active:text-red-400 transition-colors"
                  >
                    Decline Order
                  </button>
                </div>
            </div>
        </div>
      </div>
    </>
  );
};

export default NewOrderModal;