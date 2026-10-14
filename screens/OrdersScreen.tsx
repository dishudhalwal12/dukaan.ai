import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderStatus } from '../types.ts';
import OrderDetailsModal from '../components/OrderDetailsModal.tsx';
import Card from '../components/Card.tsx';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import { useBusinessLabel } from '../hooks/useBusinessLabel.ts';

const OrdersHeader: React.FC = () => {
    const label = useBusinessLabel('ORDERS');
    return (
        <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
            <h1 className="text-white text-xl font-bold tracking-tight">{label}</h1>
        </header>
    );
};

const TimeAgo: React.FC<{ timestamp: string }> = ({ timestamp }) => {
  const formattedTime = useMemo(() => {
    const date = new Date(timestamp);
    const now = new Date();

    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;

    const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const orderDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (orderDateOnly.getTime() === today.getTime()) {
      return `Today, ${date.toLocaleTimeString('en-IN', timeFormat)}`;
    }
    if (orderDateOnly.getTime() === yesterday.getTime()) {
      return `Yesterday, ${date.toLocaleTimeString('en-IN', timeFormat)}`;
    }
    
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }, [timestamp]);

  return <span className="text-neutral-400 text-xs text-right">{formattedTime}</span>;
};

const OrderStatusChip: React.FC<{ status: OrderStatus }> = ({ status }) => {
    const styles = {
        [OrderStatus.NEW]: 'bg-blue-500/20 text-blue-300',
        [OrderStatus.PREPARING]: 'bg-yellow-500/20 text-yellow-300',
        [OrderStatus.READY_FOR_PICKUP]: 'bg-purple-500/20 text-purple-300',
        [OrderStatus.COMPLETED]: 'bg-green-500/20 text-green-300',
        [OrderStatus.REJECTED]: 'bg-red-500/20 text-red-300',
    };
    return (
        <div className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status]}`}>
            {status.replace('_', ' ')}
        </div>
    );
};

const OrderCard: React.FC<{ order: Order; onClick: () => void }> = ({ order, onClick }) => {
    const { t } = useLanguage();
    return (
        <Card className="!p-0 overflow-hidden" >
            <button onClick={onClick} className="w-full text-left p-4">
                <div className="flex justify-between items-center mb-2">
                    <p className="font-bold text-white">{order.id}</p>
                    <OrderStatusChip status={order.status} />
                </div>
                <p className="text-neutral-300 font-semibold">{order.customer?.name ?? 'Walk-in Customer'}</p>
                <p className="text-neutral-400 text-sm mt-1 truncate">
                    {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                </p>
                <div className="flex justify-between items-end mt-3">
                    <div>
                        <p className="text-xl font-bold text-[#E6E6FA]">₹{Number(order.total ?? 0).toFixed(2)}</p>
                        <div className={`-ml-1 mt-1 px-1.5 py-0.5 rounded-full inline-block ${order.paymentMethod === 'UPI' ? 'bg-purple-500/20 text-purple-300' : 'bg-orange-500/20 text-orange-300'}`}>
                             <p className="text-xs font-bold tracking-wide">{order.paymentMethod}</p>
                        </div>
                    </div>
                    <TimeAgo timestamp={order.timestamp} />
                </div>
            </button>
        </Card>
    );
};

interface OrdersScreenProps {
    orders: Order[];
    onUpdateStatus: (orderId: string, status: OrderStatus) => void;
    onModalStateChange: (isOpen: boolean) => void;
}

const OrdersScreen: React.FC<OrdersScreenProps> = ({ orders, onUpdateStatus, onModalStateChange }) => {
  const [activeFilter, setActiveFilter] = useState<OrderStatus>(OrderStatus.NEW);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    onModalStateChange(!!selectedOrder);
  }, [selectedOrder, onModalStateChange]);

  const handleUpdateStatus = (orderId: string, status: OrderStatus) => {
    onUpdateStatus(orderId, status);
    setSelectedOrder(null);
  };

  const filteredOrders = useMemo(() => {
      if (activeFilter === OrderStatus.COMPLETED) {
          // A more general "Completed" tab
          return orders.filter(o => o.status === OrderStatus.COMPLETED || o.status === OrderStatus.REJECTED);
      }
      return orders.filter(o => o.status === activeFilter);
  }, [orders, activeFilter]);

  const filters = [OrderStatus.NEW, OrderStatus.PREPARING, OrderStatus.COMPLETED];

  return (
    <div>
      <OrdersHeader />
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-center bg-[#1A1A1A] p-1 rounded-full">
            {filters.map(filter => {
                const count = orders.filter(o => {
                    if (filter === OrderStatus.COMPLETED) return o.status === OrderStatus.COMPLETED || o.status === OrderStatus.REJECTED;
                    return o.status === filter
                }).length;
                const filterKey = filter === OrderStatus.COMPLETED ? 'orders_filter_history' : `orders_filter_${filter.toLowerCase()}`;
                const label = t(filterKey);

                return (
                    <button 
                        key={filter} 
                        onClick={() => setActiveFilter(filter)}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 flex items-center gap-2 ${activeFilter === filter ? 'bg-[#E6E6FA] text-black' : 'text-neutral-300'}`}>
                        {label}
                        {count > 0 && <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeFilter === filter ? 'bg-black/10' : 'bg-neutral-600/50'}`}>{count}</span>}
                    </button>
                )
            })}
        </div>
        
        {filteredOrders.length > 0 ? (
            <div className="space-y-3">
                {filteredOrders.map(order => (
                    <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center pt-20 text-center">
                <div className="flex flex-col items-center justify-center p-8 bg-[#1A1A1A] rounded-2xl w-full max-w-xs">
                     <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2D2D2D] mb-5">
                        <span className="material-symbols-outlined text-4xl text-neutral-400">list_alt</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">No Orders Here</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                        New orders in this category will appear here.
                    </p>
                </div>
            </div>
        )}

      </div>
       {selectedOrder && (
          <OrderDetailsModal 
            isOpen={!!selectedOrder}
            onClose={() => setSelectedOrder(null)}
            order={selectedOrder}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
    </div>
  );
};

export default OrdersScreen;