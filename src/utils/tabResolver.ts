import { businessPresets } from '../data/businessPresets.ts';

export interface TabConfig {
  key: string;
  label: string;
  icon: string;
}

/**
 * A label translator. Defaults to the identity function so the resolver stays
 * callable from anywhere (and from tests) without a React context.
 */
export type Translate = (key: string) => string;

const identity: Translate = (key) => key;

export function resolveTabsFromBusinessType(
  businessType: string | null,
  aiContextRaw?: string | null,
  translate: Translate = identity
): TabConfig[] {
  // The labels are translation keys, resolved through `translate`. They used to
  // be English literals, which is why the bottom bar sat in English while the
  // rest of the app followed the language setting: the keys were already in all
  // seven locale files and nothing read them.
  let ordersKey = 'nav_orders';
  let catalogKey = 'nav_catalog';
  let catalogIcon = 'local_grocery_store';
  
  const preset = businessPresets.find(p => p.displayName === businessType || p.key === businessType?.toLowerCase());

  if (preset) {
     catalogIcon = preset.icon;
     if (preset.key === 'fruits_vegetables') catalogKey = 'nav_produce';
     if (preset.key === 'dairy') catalogKey = 'nav_dairy';
     if (preset.key === 'fmcg') catalogKey = 'nav_catalog';
     if (preset.key === 'grocery') catalogKey = 'nav_catalog';
  }

  /* ── [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable ──
  // Handle "Other Grocery" or custom icon
  try {
    const customIcon = localStorage.getItem('dukan-custom-tab-icon');
    if (customIcon && (businessType === 'Other' || businessType === 'Other Grocery' || businessType === 'category_other' || !preset)) {
       catalogIcon = customIcon;
    }
  } catch(e) {}

  if (aiContextRaw) {
    try {
      const parsedContext = JSON.parse(aiContextRaw);
      const answersText = JSON.stringify(parsedContext.qa || []).toLowerCase();
      const description = parsedContext.businessContext?.storeCategory?.toLowerCase() || '';

      if (answersText.includes('vegetable') || description.includes('fruit')) {
        catalogLabel = 'Produce';
        catalogIcon = 'nutrition';
      } else if (answersText.includes('milk') || description.includes('dairy')) {
        catalogLabel = 'Dairy';
        catalogIcon = 'water_drop';
      }
    } catch (e) {
      console.warn("Failed to parse AI context for tab resolution", e);
    }
  }
  ── end [MULTI-BUSINESS] ── */

  return [
    { key: 'DASHBOARD', label: translate('nav_dashboard'), icon: 'grid_view' },
    { key: 'SALES', label: translate('nav_sales'), icon: 'bar_chart' },
    { key: 'ORDERS', label: translate(ordersKey), icon: 'receipt_long' },
    { key: 'CATALOG', label: translate(catalogKey), icon: catalogIcon },
    { key: 'SETTINGS', label: translate('nav_settings'), icon: 'settings' }
  ];
}
