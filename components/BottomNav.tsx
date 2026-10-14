
import React from 'react';
import { Screen } from '../types.ts';
import { TabConfig } from '../utils/tabResolver.ts'; // Add explicit TS type import

interface BottomNavProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
  newOrderCount: number;
  tabs: TabConfig[];
}

interface NavItemProps {
  icon: string;
  label: string;
  screen: Screen;
  isActive: boolean;
  onClick: (screen: Screen) => void;
  badgeCount?: number;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, screen, isActive, onClick, badgeCount }) => {
  const color = isActive ? 'text-[#E6E6FA]' : 'text-neutral-400';

  return (
    <button
      onClick={() => onClick(screen)}
      className={`relative flex flex-1 flex-col items-center justify-end gap-1 ${color} transition-colors duration-200`}
      aria-label={label}
    >
       {badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute top-0 right-[calc(50%-24px)] flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-[#1A1A1A]">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      <span className="material-symbols-outlined text-2xl">{icon}</span>
      <p className="text-xs font-medium">{label}</p>
    </button>
  );
};

const BottomNav: React.FC<BottomNavProps> = ({ activeScreen, onNavigate, newOrderCount, tabs }) => {
  return (
    <footer className="fixed bottom-0 w-full max-w-[460px] mx-auto left-0 right-0 z-10">
      <div className="flex justify-around border-t border-[#2D2D2D] bg-[#1A1A1A] px-2 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {tabs.map((tab) => (
          <NavItem
            key={tab.key}
            icon={tab.icon}
            label={tab.label} // Dynamic label from preset instead of translation
            screen={tab.key as Screen}
            isActive={activeScreen === tab.key}
            onClick={onNavigate}
            badgeCount={tab.key === 'ORDERS' ? newOrderCount : undefined}
          />
        ))}
      </div>
    </footer>
  );
};

export default BottomNav;