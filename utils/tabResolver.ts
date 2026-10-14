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
  let catalogIcon = 'inventory_2';
  
  const preset = businessPresets.find(p => p.displayName === businessType || p.key === businessType?.toLowerCase());

  if (preset) {
     catalogIcon = preset.icon;
     if (preset.key === 'restaurant' || preset.key === 'cafe') catalogLabel = 'Menu';
     if (preset.key === 'salon') {
       catalogLabel = 'Services';
       ordersLabel = 'Appointments';
     }
     if (preset.key === 'pharmacy') catalogLabel = 'Medicines';
     if (preset.key === 'electronics' || preset.key === 'clothing') catalogLabel = 'Products';
     if (preset.key === 'hardware') catalogLabel = 'Tools';
  }

  // Handle "Other" or unspecified using the ai context
  try {
    const customIcon = localStorage.getItem('dukan-custom-tab-icon');
    if (customIcon && (businessType === 'Other' || businessType === 'category_other' || !preset)) {
       catalogIcon = customIcon;
    }
  } catch(e) {}

  if (aiContextRaw) {
    try {
      const parsedContext = JSON.parse(aiContextRaw);
      const answersText = JSON.stringify(parsedContext.qa || []).toLowerCase();
      const description = parsedContext.businessContext?.storeCategory?.toLowerCase() || '';

      if (answersText.includes('appointment') || description.includes('booking')) {
        ordersLabel = 'Appointments';
      }
      
      if (answersText.includes('service') || description.includes('service')) {
        catalogLabel = 'Services';
      } else if (answersText.includes('food') || description.includes('food')) {
        catalogLabel = 'Menu';
      }
    } catch (e) {
      console.warn("Failed to parse AI context for tab resolution", e);
    }
  }

  return [
    { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid_view' },
    { key: 'SALES', label: 'Sales', icon: 'bar_chart' },
    { key: 'ORDERS', label: ordersLabel, icon: 'receipt_long' },
    { key: 'CATALOG', label: catalogLabel, icon: catalogIcon },
    { key: 'SETTINGS', label: 'Settings', icon: 'settings' }
  ];
}
