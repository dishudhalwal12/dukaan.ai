import {
  loadEnabledShops,
  findShopsNearby,
  searchNearbyProducts,
  getShopByPublicId,
  getShopByUserId,
  loadShopCatalog,
  getCustomerProfile,
  upsertCustomerProfile,
  saveCustomerLocation,
  clearCustomerLocation,
  listAddresses,
  getAddressRow,
  saveAddressRow,
  deleteAddressRow,
  createQuote,
  findRecentQuote,
  getQuote,
  usageCounts,
  placeOrderRpc,
  getOrderRow,
  listOrderRows,
  cancelOrderRow,
} from './data.js';

/**
 * The data surface the tools see. Tests pass a fake with the same methods;
 * production binds Supabase's user-scoped and service-role clients here.
 */
export function createRepo({ service, user, userId }) {
  if (!service || !user || !userId) throw new Error('createRepo requires service, user, and userId');

  return {
    userId,
    loadEnabledShops: () => loadEnabledShops(service),
    // Nearby search runs as the service role: it reads shop rows the customer
    // cannot see, and returns only the public shop id and public product fields.
    findShopsNearby: (fields) => findShopsNearby(service, fields),
    searchNearbyProducts: (fields) => searchNearbyProducts(service, fields),
    getShop: (publicShopId) => getShopByPublicId(service, publicShopId),
    getShopByUserId: (shopUserId) => getShopByUserId(service, shopUserId),
    getCatalog: (shopUserId) => loadShopCatalog(service, shopUserId),
    getProfile: () => getCustomerProfile(user, userId),
    saveProfile: ({ fullName, phone }) => upsertCustomerProfile(user, userId, { fullName, phone }),
    saveLocation: (fields) => saveCustomerLocation(user, userId, fields),
    clearLocation: () => clearCustomerLocation(user, userId),
    listAddresses: () => listAddresses(user, userId),
    getAddressRow: (addressId) => getAddressRow(user, userId, addressId),
    saveAddress: (fields) => saveAddressRow(user, userId, fields),
    deleteAddress: (addressId) => deleteAddressRow(user, userId, addressId),
    createQuote: (row) => createQuote(service, { ...row, userId }),
    findRecentQuote: (requestHash, sinceIso) => findRecentQuote(user, userId, requestHash, sinceIso),
    getQuote: (quoteId) => getQuote(service, userId, quoteId),
    usageCounts: (shopUserId, since) => usageCounts(service, userId, shopUserId, since),
    placeOrder: ({ quoteId, externalId }) => placeOrderRpc(service, { quoteId, userId, externalId }),
    getOrder: (orderId) => getOrderRow(service, userId, orderId),
    listOrders: (limit) => listOrderRows(service, userId, limit),
    cancelOrder: (orderId) => cancelOrderRow(service, userId, orderId),
  };
}
