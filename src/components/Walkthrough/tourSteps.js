/**
 * The walkthrough shape, kept plain so the Node test can assert it without a DOM.
 * `screen` matches a key of the Screen enum; copy is resolved through `t()`.
 */
export const TOUR_STEPS = [
  {
    key: 'dashboard',
    screen: 'DASHBOARD',
    element: '[data-tour="dashboard-insights"]',
    side: 'bottom',
    align: 'center',
    icon: 'barChart',
    titleKey: 'tour_dashboard_title',
    descriptionKey: 'tour_dashboard_desc',
  },
  {
    key: 'sales',
    screen: 'SALES',
    element: '[data-tour="sales-filters"]',
    side: 'bottom',
    align: 'center',
    icon: 'dollarSign',
    titleKey: 'tour_sales_title',
    descriptionKey: 'tour_sales_desc',
  },
  {
    key: 'orders_new',
    screen: 'ORDERS',
    element: '[data-tour="orders-demo-container"]',
    side: 'top',
    align: 'center',
    icon: 'zap',
    titleKey: 'tour_orders_new_title',
    descriptionKey: 'tour_orders_new_desc',
  },
  {
    key: 'orders_pickup',
    screen: 'ORDERS',
    element: '[data-tour="orders-demo-container"]',
    side: 'top',
    align: 'center',
    icon: 'package',
    titleKey: 'tour_orders_pickup_title',
    descriptionKey: 'tour_orders_pickup_desc',
  },
  {
    key: 'orders_pay',
    screen: 'ORDERS',
    element: '[data-tour="orders-demo-container"]',
    side: 'top',
    align: 'center',
    icon: 'creditCard',
    titleKey: 'tour_orders_pay_title',
    descriptionKey: 'tour_orders_pay_desc',
  },
  {
    key: 'catalog',
    screen: 'CATALOG',
    element: '[data-tour="catalog-search-add"]',
    side: 'bottom',
    align: 'center',
    icon: 'tag',
    titleKey: 'tour_catalog_title',
    descriptionKey: 'tour_catalog_desc',
  },
  {
    key: 'profile',
    screen: 'SETTINGS',
    subScreen: 'profile',
    element: '[data-tour="edit-profile-tour"]',
    side: 'bottom',
    align: 'center',
    icon: 'user',
    titleKey: 'tour_profile_title',
    descriptionKey: 'tour_profile_desc',
  },
];

export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Which demo state each tour step shows. Steps 0–1 do not show the sheet. */
export const demoStateForTourStep = (index) => {
  if (index <= 2) return 'new_order';
  if (index === 3) return 'order_details';
  if (index === 4) return 'scan_to_pay';
  return 'completed';
};

/** Where a demo button should move the tour. `completed` lands on Catalog. */
const DEMO_STATE_TO_TOUR_INDEX = {
  new_order: 2,
  order_details: 3,
  scan_to_pay: 4,
  completed: 5,
};

export const tourStepForDemoState = (state) =>
  Object.prototype.hasOwnProperty.call(DEMO_STATE_TO_TOUR_INDEX, state)
    ? DEMO_STATE_TO_TOUR_INDEX[state]
    : null;
