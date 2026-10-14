
import React, { useState, useMemo } from 'react';
import Card from '../components/Card.tsx';
import { Order, OrderStatus } from '../types.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';

// Guard against undefined/NaN totals from webhook orders or old localStorage data
const safeTotal = (order: Order): number => Number(order.total ?? 0) || 0;

// --- Date Helper Functions ---
const isToday = (date: Date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

const isLast7Days = (date: Date) => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    today.setHours(23, 59, 59, 999);
    return date >= sevenDaysAgo && date <= today;
};

const isThisMonth = (date: Date) => {
  const today = new Date();
  return date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

const SalesHeader: React.FC = () => {
  const { t } = useLanguage();
  return (
    <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
      <h1 className="text-white text-xl font-bold tracking-tight">{t('sales_title')}</h1>
    </header>
  );
};

const DateFilter: React.FC<{ activeFilter: string; setActiveFilter: (filter: string) => void; }> = ({ activeFilter, setActiveFilter }) => {
    const { t } = useLanguage();
    const filters = [
      { label: 'Today', key: 'sales_filter_today' },
      { label: 'This Week', key: 'sales_filter_week' },
      { label: 'This Month', key: 'sales_filter_month' }
    ];

    return (
        <div className="flex items-center justify-center bg-[#1A1A1A] p-1 rounded-full">
            {filters.map(filter => (
                 <button 
                    key={filter.label} 
                    onClick={() => setActiveFilter(filter.label)}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 ${activeFilter === filter.label ? 'bg-[#E6E6FA] text-black' : 'text-neutral-300'}`}>
                    {t(filter.key)}
                </button>
            ))}
        </div>
    );
};

const SalesMetrics: React.FC<{ orders: Order[] }> = ({ orders }) => {
    const { t } = useLanguage();
    const metrics = useMemo(() => {
        const totalSales = orders.reduce((sum, order) => sum + safeTotal(order), 0);
        const orderCount = orders.length;
        const avgValue = orderCount > 0 ? totalSales / orderCount : 0;
        return { totalSales, orderCount, avgValue };
    }, [orders]);

    return (
        <div className="grid grid-cols-3 gap-3">
            <Card className="items-center !p-3">
                <p className="text-neutral-400 text-xs font-medium">{t('sales_total_sales')}</p>
                <p className="text-white text-lg font-bold">₹{metrics.totalSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </Card>
            <Card className="items-center !p-3">
                <p className="text-neutral-400 text-xs font-medium">{t('sales_orders')}</p>
                <p className="text-white text-lg font-bold">{metrics.orderCount}</p>
            </Card>
            <Card className="items-center !p-3">
                <p className="text-neutral-400 text-xs font-medium">{t('sales_avg_value')}</p>
                <p className="text-white text-lg font-bold">₹{metrics.avgValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </Card>
        </div>
    );
};

const SalesChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
    if (!data || data.length === 0) return null; // Don't render empty chart

    const width = 320;
    const height = 160;
    const padding = { top: 10, right: 0, bottom: 20, left: 30 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    const maxValue = Math.max(...data.map(d => d.value), 1000) * 1.1; // Add 10% buffer, min value of 1000
    const minValue = 0;

    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (value: number) => height - padding.bottom - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    const pathData = data.map((point, i) => {
        const x = xScale(i);
        const y = yScale(point.value);
        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    }).join(' ');

    const yAxisLabels = [0, Math.round(maxValue / 2), Math.round(maxValue)].map(value => ({
        value: `₹${(value/1000).toFixed(value > 1000 ? 1 : 0)}k`,
        y: yScale(value)
    }));

    return (
        <div className="bg-[#1A1A1A] rounded-xl p-4 h-48 flex flex-col justify-end">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#c084fc" />
                        <stop offset="100%" stopColor="#E6E6FA" />
                    </linearGradient>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#E6E6FA" stopOpacity={0.2} />
                         <stop offset="100%" stopColor="#E6E6FA" stopOpacity={0} />
                    </linearGradient>
                </defs>

                {/* Grid Lines & Y-Axis Labels */}
                {yAxisLabels.map((label, i) => (
                    <g key={i}>
                        <line 
                            x1={padding.left} 
                            y1={label.y} 
                            x2={width - padding.right} 
                            y2={label.y} 
                            stroke="#2D2D2D" 
                            strokeWidth="1"
                            strokeDasharray="2 4"
                        />
                         <text
                            x={padding.left - 5}
                            y={label.y}
                            textAnchor="end"
                            dy="0.3em"
                            fill="#8A8A8A"
                            fontSize="10"
                            fontWeight="500"
                        >
                            {label.value}
                        </text>
                    </g>
                ))}

                {/* Area under line */}
                <path d={`${pathData} L ${xScale(data.length - 1)},${height - padding.bottom} L ${xScale(0)},${height - padding.bottom} Z`} fill="url(#areaGradient)" />


                {/* Line Path */}
                <path d={pathData} fill="none" stroke="url(#lineGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Data Points */}
                {data.map((point, i) => (
                     <circle key={i} cx={xScale(i)} cy={yScale(point.value)} r="3" fill="#E6E6FA" />
                ))}

                 {/* X-axis labels */}
                {data.map((point, i) => (
                    <text 
                        key={i} 
                        x={xScale(i)} 
                        y={height - 5} 
                        textAnchor="middle" 
                        fill="#8A8A8A" 
                        fontSize="10" 
                        fontWeight="500"
                    >
                        {point.label}
                    </text>
                ))}
            </svg>
        </div>
    );
};


const TransactionItem: React.FC<{id: string, time: string, amount: string}> = ({id, time, amount}) => (
    <div className="flex items-center justify-between p-3 bg-[#1A1A1A] rounded-lg">
        <div>
            <p className="font-semibold text-white">Order #{id}</p>
            <p className="text-sm text-neutral-400">{time}</p>
        </div>
        <p className="font-bold text-lg text-[#E6E6FA]">{amount}</p>
    </div>
);


const SalesScreen: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const [activeFilter, setActiveFilter] = useState('This Week');
  const { t } = useLanguage();

  const filteredOrders = useMemo(() => {
    const relevantOrders = orders
      .filter(o => o.status !== OrderStatus.NEW && o.status !== OrderStatus.REJECTED)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    switch (activeFilter) {
      case 'Today':
        return relevantOrders.filter(o => isToday(new Date(o.timestamp)));
      case 'This Week':
        return relevantOrders.filter(o => isLast7Days(new Date(o.timestamp)));
      case 'This Month':
        return relevantOrders.filter(o => isThisMonth(new Date(o.timestamp)));
      default:
        return relevantOrders;
    }
  }, [orders, activeFilter]);

  const chartData = useMemo(() => {
    const relevantOrders = orders
      .filter(o => o.status !== OrderStatus.NEW && o.status !== OrderStatus.REJECTED);
    
    const today = new Date();

    switch (activeFilter) {
      case 'Today': {
        const dayParts = [
            { label: 'Morning', value: 0 },   // 5am-12pm
            { label: 'Afternoon', value: 0 }, // 12pm-5pm
            { label: 'Evening', value: 0 },   // 5pm-9pm
            { label: 'Night', value: 0 },     // 9pm-5am
        ];
        relevantOrders
          .filter(o => isToday(new Date(o.timestamp)))
          .forEach(order => {
              const hour = new Date(order.timestamp).getHours();
              if (hour >= 5 && hour < 12) dayParts[0].value += safeTotal(order);
              else if (hour >= 12 && hour < 17) dayParts[1].value += safeTotal(order);
              else if (hour >= 17 && hour < 21) dayParts[2].value += safeTotal(order);
              else dayParts[3].value += safeTotal(order);
          });
        return dayParts;
      }
      
      case 'This Month': {
        const weeks = Array.from({length: 5}, (_, i) => ({ label: `W${i+1}`, value: 0 }));
        
        relevantOrders
          .filter(o => isThisMonth(new Date(o.timestamp)))
          .forEach(order => {
            const dayOfMonth = new Date(order.timestamp).getDate();
            const weekIndex = Math.floor((dayOfMonth - 1) / 7);
            if (weeks[weekIndex]) {
                weeks[weekIndex].value += safeTotal(order);
            }
          });

        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const numWeeks = Math.ceil(lastDay / 7);
        return weeks.slice(0, numWeeks);
      }

      case 'This Week':
      default: {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const salesByDay = new Array(7).fill(0).map((_, i) => {
            const date = new Date();
            date.setDate(today.getDate() - (6 - i));
            return { value: 0, label: days[date.getDay()] };
        });

        relevantOrders
            .filter(o => isLast7Days(new Date(o.timestamp)))
            .forEach(order => {
                const orderDate = new Date(order.timestamp);
                const todayMidnight = new Date();
                todayMidnight.setHours(0,0,0,0);
                const orderDateMidnight = new Date(orderDate);
                orderDateMidnight.setHours(0,0,0,0);
                const diffDays = Math.round((todayMidnight.getTime() - orderDateMidnight.getTime()) / (1000 * 3600 * 24));
                
                if (diffDays >= 0 && diffDays < 7) {
                    const index = 6 - diffDays;
                    if(salesByDay[index]){
                        salesByDay[index].value += safeTotal(order);
                    }
                }
            });

        return salesByDay;
      }
    }
  }, [orders, activeFilter]);

  return (
    <div>
      <SalesHeader />
      <div className="p-4 space-y-6">
        <DateFilter activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
        <SalesMetrics orders={filteredOrders} />
        <SalesChart data={chartData}/>
        <div>
            <h2 className="text-white text-lg font-bold tracking-tight px-2 pb-3">{t('sales_recent_transactions')}</h2>
            <div className="space-y-3">
                {filteredOrders.length > 0 ? (
                    filteredOrders.slice(0, 5).map(order => (
                        <TransactionItem 
                            key={order.id}
                            id={order.id.replace('B2C-', '')}
                            time={new Date(order.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            amount={`₹${safeTotal(order).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                        />
                    ))
                ) : (
                    <div className="text-center py-10 text-neutral-400">
                        <p className="font-semibold">No transactions for this period.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SalesScreen;
