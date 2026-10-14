import React from 'react';

const InsightsHeader: React.FC = () => (
  <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
    <h1 className="text-white text-xl font-bold tracking-tight">AI Insights</h1>
  </header>
);

interface InsightListItemProps {
    icon: string;
    iconBgColor: string;
    category: string;
    title: string;
    description: string;
}

const InsightListItem: React.FC<InsightListItemProps> = ({ icon, iconBgColor, category, title, description }) => (
    <div className="flex items-start gap-4 p-4 bg-[#1A1A1A] rounded-xl">
        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${iconBgColor}`}>
            <span className="material-symbols-outlined text-white">{icon}</span>
        </div>
        <div className="flex-1">
            <p className="text-[#E6E6FA] text-xs font-bold uppercase tracking-wider">{category}</p>
            <p className="text-white font-bold mt-1">{title}</p>
            <p className="text-neutral-400 text-sm mt-1">{description}</p>
        </div>
    </div>
);

const InsightsScreen: React.FC = () => {
    const insights: InsightListItemProps[] = [
        { icon: 'lightbulb', iconBgColor: 'bg-yellow-500', category: 'Suggestion', title: 'Stock More Maggi Noodles', description: 'Sales data shows it will be a hot item this weekend.' },
        { icon: 'trending_up', iconBgColor: 'bg-blue-500', category: 'Forecast', title: 'Expect 20% More Customers for Cold Drinks', description: 'Prepare for higher demand due to the upcoming heatwave.' },
        { icon: 'warning', iconBgColor: 'bg-red-500', category: 'Alert', title: 'Cash Mismatch of ₹500 Detected', description: 'A cash mismatch was detected last Saturday. Click to review.' },
        { icon: 'local_fire_department', iconBgColor: 'bg-orange-500', category: 'Trend', title: 'Hocco Mango Aamchi is Trending', description: 'Sales are spiking in your area. Consider stocking it.' },
        { icon: 'inventory', iconBgColor: 'bg-purple-500', category: 'Inventory', title: 'Low Stock on Amul Butter', description: 'You have only 5 units left. Reorder soon to avoid stockout.' },
    ];

  return (
    <div>
      <InsightsHeader />
      <div className="p-4 space-y-4">
        {insights.map((insight, index) => (
            <InsightListItem key={index} {...insight} />
        ))}
      </div>
    </div>
  );
};

export default InsightsScreen;