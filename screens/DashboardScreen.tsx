

import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card.tsx';
import UploadMenu from '../components/UploadMenu.tsx';
import { useInsights } from '../contexts/ProductContext.tsx';
import { Order, OrderStatus } from '../types.ts';
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
    <div className="flex flex-1 flex-col gap-1.5">
      <p className="text-base font-bold leading-tight text-white">{title}</p>
      <p className="text-sm font-normal leading-normal text-neutral-400">{description}</p>
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

        // We consider an order a "sale" once it has been accepted (i.e., not NEW or REJECTED)
        const relevantOrders = orders.filter(o => 
            o.status !== OrderStatus.NEW && o.status !== OrderStatus.REJECTED
        );

        relevantOrders.forEach(order => {
            const orderDate = new Date(order.timestamp);
            if (isToday(orderDate)) {
                today.sales += Number(order.total ?? 0) || 0;
                today.orders += 1;
            }
            if (isThisMonth(orderDate)) {
                thisMonth.sales += Number(order.total ?? 0) || 0;
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
          {storeName && (
            <span className="mt-0.5 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 border border-emerald-500/20 text-[10px] font-bold tracking-wider text-emerald-400 uppercase shadow-[0_0_10px_rgba(16,185,129,0.1)]">
              <span className="material-symbols-outlined" style={{ fontSize: '13px', lineHeight: 1 }}>storefront</span>
              powered by dukaan.ai
            </span>
          )}
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

        <div>
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
                <InsightCard icon="error" title="Error" description={error} />
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