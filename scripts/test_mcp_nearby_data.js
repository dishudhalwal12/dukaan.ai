import assert from 'assert';
import { findShopsNearby, searchNearbyProducts } from '../mcp/data.js';

/**
 * The two scale functions are the only way the server should look at shops once
 * there are thousands of them. This pins the call shape (argument names must match
 * the SQL signature) and the row normalisation (PostgREST returns numerics as
 * strings for `numeric` columns, and a string distance would break every
 * comparison downstream).
 */
console.log('--- RUNNING MCP NEARBY DATA TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

function stubClient(result) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  };
}

const shopRows = [{
  shop_id: 'shop_one', user_id: 'u-shop', name: 'Ramu General Store',
  latitude: 26.9092, longitude: 75.1846, distance_km: '0.12', delivery_radius_km: '5',
  item_count: '13', orders_paused: false,
}];
const shopClient = stubClient({ data: shopRows, error: null });
const shops = await findShopsNearby(shopClient, { lat: 26.9, lng: 75.18, radiusKm: 5, query: null, limit: 7 });
assert.deepStrictEqual(shopClient.calls[0], {
  name: 'mcp_find_shops',
  args: { p_lat: 26.9, p_lng: 75.18, p_radius_km: 5, p_query: null, p_limit: 7 },
});
assert.strictEqual(shops.length, 1);
assert.strictEqual(shops[0].shopId, 'shop_one');
assert.strictEqual(shops[0].userId, 'u-shop');
assert.strictEqual(shops[0].distanceKm, 0.12, 'numeric distance is a number, not a string');
assert.strictEqual(shops[0].catalogItemCount, 13);
assert.strictEqual(shops[0].deliveryRadiusKm, 5);
ok('findShopsNearby calls the RPC by signature and normalises numeric strings');

const productRows = [{
  shop_id: 'shop_one', user_id: 'u-shop', name: 'Ramu General Store',
  latitude: 26.9092, longitude: 75.1846, distance_km: '0.12',
  product_id: 'prod_soap', product_name: 'Lifeboy Soap', price: '₹40', unit: 'units', stock: 3,
}];
const productClient = stubClient({ data: productRows, error: null });
const rows = await searchNearbyProducts(productClient, { lat: 26.9, lng: 75.18, radiusKm: 5, tokens: ['soap', 'sabun'], limit: 40 });
assert.deepStrictEqual(productClient.calls[0], {
  name: 'mcp_search_nearby_products',
  args: { p_lat: 26.9, p_lng: 75.18, p_radius_km: 5, p_tokens: ['soap', 'sabun'], p_limit: 40 },
});
assert.strictEqual(rows[0].productId, 'prod_soap');
assert.strictEqual(rows[0].productName, 'Lifeboy Soap');
assert.strictEqual(rows[0].distanceKm, 0.12);
assert.strictEqual(rows[0].shopId, 'shop_one');
ok('searchNearbyProducts passes the token list and maps the joined rows');

const failing = { rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
await assert.rejects(() => findShopsNearby(failing, { lat: 1, lng: 1 }), (error) => error.code === 'registry_unavailable');
await assert.rejects(() => searchNearbyProducts(failing, { lat: 1, lng: 1, tokens: ['x'] }), (error) => error.code === 'catalog_unavailable');
ok('a database error keeps its tool-facing code');

console.log(`\nAll ${n} nearby data checks passed.`);
