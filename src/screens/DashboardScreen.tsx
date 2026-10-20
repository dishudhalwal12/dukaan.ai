

import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card.tsx';
import UploadMenu from '../components/UploadMenu.tsx';
import { useInsights } from '../contexts/ProductContext.tsx';
import { Order } from '../types.ts';
import { isAcceptedSale, isCancelledOrRejected } from '../utils/orderStatus.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';

const InsightCard: React.FC<{
  icon: string;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex items-center gap-4 rounded-xl p-4 bg-[#1A1A1A]">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2D2D2D]">
      <span className="material-symbols-outlined text-2xl text-[#E6E6FA]">{icon}</span>
    </div>
    <div className="flex flex-1 flex-col gap-1.5 min-w-0">
      <p className="text-base font-bold leading-tight text-white truncate">{title}</p>
      <p className="text-sm font-normal leading-snug text-neutral-400 line-clamp-3 overflow-hidden break-words">{description}</p>
    </div>
  </div>
);

const InsightSkeleton: React.FC = () => (
    <div className="flex items-center gap-4 rounded-xl p-4 bg-[#1A1A1A]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2D2D2D] animate-pulse"></div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 bg-[#2D2D2D] rounded w-3/4 animate-pulse"></div>
        <div className="h-3 bg-[#2D2D2D] rounded w-full animate-pulse"></div>
      </div>
    </div>
);

// --- Date Helper Functions ---
const isToday = (someDate: Date) => {
    const today = new Date();
    return someDate.getDate() === today.getDate() &&
           someDate.getMonth() === today.getMonth() &&
           someDate.getFullYear() === today.getFullYear();
};

const isThisMonth = (someDate: Date) => {
    const today = new Date();
    return someDate.getMonth() === today.getMonth() &&
           someDate.getFullYear() === today.getFullYear();
};

interface DashboardScreenProps {
    orders: Order[];
    onModalStateChange: (isOpen: boolean) => void;
    onAddOrders: (newOrders: Order[]) => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ orders, onModalStateChange, onAddOrders }) => {
    const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
    const { insights, isLoadingInsights, error, refreshInsights } = useInsights();
    const { t } = useLanguage();

    const storeName = localStorage.getItem('dukan-store-name') || '';

    useEffect(() => {
        onModalStateChange(isUploadMenuOpen);
    }, [isUploadMenuOpen, onModalStateChange]);

    const toggleUploadMenu = () => setIsUploadMenuOpen(prev => !prev);
    
    const metrics = useMemo(() => {
        const today = { sales: 0, orders: 0 };
        const thisMonth = { sales: 0, orders: 0 };

        orders.forEach(order => {
            // A rejected or cancelled order was never an order. Anything else is
            // counted; only an accepted, never-killed one carries its total into
            // sales — a NEW/PENDING order is an order but not yet a sale.
            if (isCancelledOrRejected(order.status)) return;
            const sale = isAcceptedSale(order.status) ? Number(order.total ?? 0) || 0 : 0;

            const orderDate = new Date(order.timestamp);
            if (isToday(orderDate)) {
                today.sales += sale;
                today.orders += 1;
            }
            if (isThisMonth(orderDate)) {
                thisMonth.sales += sale;
                thisMonth.orders += 1;
            }
        });
        
        return { today, thisMonth };
    }, [orders]);


  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2">
        <div className="w-12"></div>
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <h1 className="text-xl font-bold tracking-tight text-white">
            {storeName || t('dashboard_title')}
          </h1>
        </div>
        <div className="flex w-12 items-center justify-end">
          <button onClick={toggleUploadMenu} className="flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#E6E6FA] text-black">
            <span className="material-symbols-outlined text-3xl">add</span>
          </button>
        </div>
      </header>

      <div className="space-y-8 p-4">
        <div>
          <h2 className="px-2 pb-3 text-lg font-bold tracking-tight text-white">{t('dashboard_today')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-sm font-medium text-neutral-400">{t('dashboard_sales')}</p>
              <p className="text-2xl font-bold text-white">₹{metrics.today.sales.toLocaleString('en-IN')}</p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-neutral-400">{t('dashboard_orders')}</p>
              <p className="text-2xl font-bold text-white">{metrics.today.orders}</p>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="px-2 pb-3 text-lg font-bold tracking-tight text-white">{t('dashboard_this_month')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-sm font-medium text-neutral-400">{t('dashboard_sales')}</p>
              <p className="text-2xl font-bold text-white">₹{metrics.thisMonth.sales.toLocaleString('en-IN')}</p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-neutral-400">{t('dashboard_orders')}</p>
              <p className="text-2xl font-bold text-white">{metrics.thisMonth.orders}</p>
            </Card>
          </div>
        </div>

        <div data-tour="dashboard-insights">
          <div className="flex justify-between items-center px-2 pb-3">
            <h2 className="text-lg font-bold tracking-tight text-white">{t('dashboard_insights')}</h2>
             <button 
                onClick={refreshInsights} 
                disabled={isLoadingInsights}
                className="p-2 text-neutral-400 rounded-full hover:bg-[#2D2D2D] active:bg-neutral-600 disabled:opacity-50 disabled:cursor-wait transition-colors"
                aria-label={t('dashboard_refresh_insights')}
            >
                <span className={`material-symbols-outlined ${isLoadingInsights ? 'animate-spin' : ''}`}>
                    sync
                </span>
            </button>
          </div>
          <div className="space-y-4">
            {error ? (
                <InsightCard icon="error" title={t('generic_error')} description={error} />
            ) : (
              <>
                {insights.map((insight, index) => (
                  <InsightCard
                    key={index}
                    icon={insight.icon}
                    title={insight.title}
                    description={insight.description}
                  />
                ))}
                {isLoadingInsights && Array.from({ length: Math.max(0, 5 - insights.length) }).map((_, index) => (
                  <InsightSkeleton key={`skel-${index}`} />
                ))}
                {!isLoadingInsights && insights.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-6 bg-[#1A1A1A] rounded-xl text-center border border-[#2D2D2D]">
                    <span className="material-symbols-outlined text-3xl text-neutral-400 mb-2">auto_awesome</span>
                    <p className="text-sm font-semibold text-white mb-1">{t('dashboard_no_insights')}</p>
                    <p className="text-xs text-neutral-400 mb-3">{t('dashboard_no_insights_hint')}</p>
                    <button
                      onClick={refreshInsights}
                      className="px-4 py-1.5 bg-[#E6E6FA] text-black text-xs font-semibold rounded-lg hover:bg-white transition-colors"
                    >
                      {t('dashboard_generate_insights')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <UploadMenu isOpen={isUploadMenuOpen} onClose={toggleUploadMenu} onAddOrders={onAddOrders} />
    </div>
  );
};

export default DashboardScreen;