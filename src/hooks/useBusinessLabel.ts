import { useMemo } from 'react';
import { resolveTabsFromBusinessType, TabConfig } from '../utils/tabResolver';
import { useLanguage } from '../contexts/LanguageContext.tsx';

/**
 * The label for the Orders / Catalog screen header.
 *
 * Derived, not stored: the header has to say "Produce" for a greengrocer and
 * "Catalog" for a general store, and both of those have to follow the language
 * setting. The previous version copied the label into state inside an effect
 * keyed only on the screen name, so it was captured once, in English, and never
 * refreshed.
 */
export function useBusinessLabel(key: string): string {
    const { language, t } = useLanguage();

    return useMemo(() => {
        const category = localStorage.getItem('dukan-store-category');
        const contextStr = localStorage.getItem('dukan-business-intelligence-context');

        const tabs: TabConfig[] = resolveTabsFromBusinessType(category, contextStr, t);
        const matchingTab = tabs.find(tab => tab.key === key);

        if (matchingTab) return matchingTab.label;

        // Fallbacks if the key is not one of the tabs.
        switch (key) {
            case 'ORDERS': return t('nav_orders');
            case 'CATALOG': return t('nav_catalog');
            default: return key;
        }
        // `t` changes identity when a different locale finishes loading, which is
        // what re-creates the label.
    }, [key, t, language]);
}
