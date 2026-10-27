import { createClient } from '@supabase/supabase-js';

/**
 * Seeds the account and shop a reviewer needs to test this plugin.
 *
 * The review notes tell them to order from pincode 303604 (Sambhar). That only
 * works if a shop exists there, stocks the item, and the demo customer already
 * has a delivery address and a position, so the flow succeeds without the
 * reviewer granting location on a machine in another country.
 *
 * Idempotent: rerunning it repairs the same rows instead of duplicating them.
 *
 *   node --env-file=.env scripts/qa/seed_review_account.mjs
 */
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
  process.exit(1);
}

const CUSTOMER_EMAIL = 'reviewer@dukaan-ai.com';
const SHOP_EMAIL = 'review-shop@dukaan-ai.com';
const PASSWORD = 'DukaanReview2026!';
const SHOP_NAME = 'Dukaan Review Shop';
const LAT = 26.9092;
const LNG = 75.1846;

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function ensureUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { seeded_for: 'plugin review' },
  });
  if (!error) return data.user;

  if (!/already|exist|registered/i.test(error.message)) throw new Error(`${email}: ${error.message}`);

  for (let page = 1; page <= 25; page += 1) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw new Error(listError.message);
    const found = list.users.find((user) => user.email === email);
    if (found) return found;
    if (list.users.length < 200) break;
  }
  throw new Error(`${email} exists but could not be read back`);
}

const customer = await ensureUser(CUSTOMER_EMAIL);
const shopUser = await ensureUser(SHOP_EMAIL);

const now = new Date().toISOString();

// 1. Customer profile and last known position (the consent-page side channel).
{
  const { error } = await admin.from('customer_profiles').upsert({
    user_id: customer.id,
    full_name: 'Review Customer',
    phone: '+919876500001',
    location_lat: LAT,
    location_lng: LNG,
    location_accuracy_m: 30,
    location_source: 'gps',
    location_captured_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(`customer profile: ${error.message}`);
}

// 2. The shop that delivers to that pincode.
{
  const { error } = await admin.from('business_profiles').upsert({
    user_id: shopUser.id,
    store_name: SHOP_NAME,
    store_lat: LAT,
    store_lng: LNG,
    store_location_source: 'gps',
    store_location_accuracy_m: 20,
    store_location_captured_at: now,
    delivery_radius_km: 10,
    mcp_enabled: true,
    orders_paused: false,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(`shop: ${error.message}`);
}

// 3. A small catalog with the items the review prompts mention.
const catalog = [
  ['review_soap_a', 'Dettol Original Soap (125g)', '₹55', 90, 'bars'],
  ['review_soap_b', 'Lifeboy Soap', '₹40', 40, 'bars'],
  ['review_milk', 'Amul Gold Milk (1L)', '₹68', 30, 'cartons'],
  ['review_bread', 'Brown Bread (400g)', '₹45', 25, 'packs'],
  ['review_eggs', 'Eggs (6 pack)', '₹60', 20, 'packs'],
  ['review_atta', 'Aashirvaad Atta (5kg)', '₹245', 15, 'bags'],
  ['review_rice', 'India Gate Basmati Rice (1kg)', '₹120', 18, 'packs'],
  ['review_oil', 'Fortune Soyabean Oil (1L)', '₹165', 22, 'pouches'],
  ['review_salt', 'Tata Salt (1kg)', '₹28', 40, 'packs'],
  ['review_tea', 'Tata Tea Premium (500g)', '₹290', 12, 'packs'],
  ['review_biscuit', 'Parle-G Biscuits (1kg)', '₹85', 30, 'packs'],
  ['review_detergent', 'Surf Excel Matic (1kg)', '₹140', 20, 'packs'],
  ['review_paste', 'Colgate MaxFresh (150g)', '₹110', 25, 'tubes'],
];
{
  const rows = catalog.map(([external_id, name, price, stock, stock_unit]) => ({
    user_id: shopUser.id,
    external_id,
    name,
    price,
    stock,
    stock_unit,
    image_url: null,
    attributes: { category: 'General' },
    updated_at: now,
  }));
  const { error } = await admin.from('products').upsert(rows, { onConflict: 'user_id,external_id' });
  if (error) throw new Error(`products: ${error.message}`);
}

// 4. One saved address, so quote_order works without any typing.
{
  await admin.from('customer_addresses')
    .delete()
    .eq('user_id', customer.id)
    .eq('label', 'Home (review)');

  const { error } = await admin.from('customer_addresses').insert({
    user_id: customer.id,
    label: 'Home (review)',
    line1: '29, infront of hospital',
    city: 'Sambhar',
    state: 'Rajasthan',
    pincode: '303604',
    lat: LAT,
    lng: LNG,
    accuracy_m: 30,
    match_type: 'street',
    source: 'map_pin',
    precision_source: 'app_location',
    geocode_verified: false,
    coords_captured_at: now,
    is_default: true,
  });
  if (error) throw new Error(`address: ${error.message}`);
}

const { data: shopRow } = await admin
  .from('business_profiles')
  .select('public_shop_id, store_name, delivery_radius_km, mcp_enabled, orders_paused')
  .eq('user_id', shopUser.id)
  .maybeSingle();

console.log(`
  review account
    email      ${CUSTOMER_EMAIL}
    password   ${PASSWORD}

  seeded shop
    name       ${shopRow?.store_name}
    shop id    ${shopRow?.public_shop_id}
    radius     ${shopRow?.delivery_radius_km} km
    ai orders  ${shopRow?.mcp_enabled ? 'on' : 'off'}${shopRow?.orders_paused ? ' (paused)' : ''}

  review steps
    sign in with the email above, then send:
      "Order 2 packs of soap from the nearest shop"
    the saved address (303604) and the saved position make it work from any country
`);
