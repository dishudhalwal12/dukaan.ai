import { useState, useEffect } from 'react';
import { resolveTabsFromBusinessType, TabConfig } from '../utils/tabResolver';

export function useBusinessLabel(key: string): string {
    const [label, setLabel] = useState<string>('');

    useEffect(() => {
        const category = localStorage.getItem('dukan-store-category');
        const contextStr = localStorage.getItem('dukan-business-intelligence-context');
        
        const tabs = resolveTabsFromBusinessType(category, contextStr);
        const matchingTab = tabs.find(t => t.key === key);
        
        if (matchingTab) {
            setLabel(matchingTab.label);
        } else {
            // Fallbacks if not found in tabs
            switch(key) {
                case 'ORDERS': setLabel('Orders'); break;
                case 'CATALOG': setLabel('Catalog'); break;
                default: setLabel(key);
            }
        }
    }, [key]);

    return label;
}
