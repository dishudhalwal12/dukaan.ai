import { businessPresets } from '../data/businessPresets.ts';

export interface TabConfig {
  key: string;
  label: string;
  icon: string;
}

export function resolveTabsFromBusinessType(
  businessType: string | null,
  aiContextRaw?: string | null
): TabConfig[] {
  let ordersLabel = 'Orders';
  let catalogLabel = 'Catalog';
  let catalogIcon = 'local_grocery_store';
  
  const preset = businessPresets.find(p => p.displayName === businessType || p.key === businessType?.toLowerCase());

  if (preset) {
     catalogIcon = preset.icon;
     if (preset.key === 'fruits_vegetables') catalogLabel = 'Produce';
     if (preset.key === 'dairy') catalogLabel = 'Dairy';
     if (preset.key === 'fmcg') catalogLabel = 'Catalog';
     if (preset.key === 'grocery') catalogLabel = 'Catalog';
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
    { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
    { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
    { key: 'ORDERS', label: ordersLabel, icon: 'receipt_long' },
    { key: 'CATALOG', label: catalogLabel, icon: catalogIcon },
    { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
  ];
}
