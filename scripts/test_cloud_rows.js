import assert from 'assert';
import { ownerColumnsFromAuthUser, orderRowFromOrder } from '../src/utils/cloudRows.ts';

console.log('--- RUNNING CLOUD ROW TESTS ---');

// ── Test 1: the owner identity mirrors the auth session ──────────────────────
// These columns are what the dashboard shows next to a shop; they were left NULL
// because the writers only stored the raw profile_data blob.
console.log('\nTest 1: ownerColumnsFromAuthUser');
const google = ownerColumnsFromAuthUser({
  user_metadata: { full_name: 'Divyanshu Saini', picture: 'https://lh3.googleusercontent.com/a/x.png', locale: 'en-IN' },
  app_metadata: { provider: 'google' },
});
assert.strictEqual(google.owner_first_name, 'Divyanshu');
assert.strictEqual(google.owner_last_name, 'Saini');
assert.strictEqual(google.google_picture_url, 'https://lh3.googleusercontent.com/a/x.png');
assert.strictEqual(google.auth_provider, 'google');
assert.strictEqual(google.preferred_language, 'en-IN');

// A single-word name has no last name, and must not be split in half.
const oneWord = ownerColumnsFromAuthUser({
  user_metadata: { full_name: 'Rovexa' },
  app_metadata: { provider: 'google' },
});
assert.strictEqual(oneWord.owner_first_name, 'Rovexa');
assert.strictEqual(oneWord.owner_last_name, null, 'a one-word name has no last name');

// Supabase sets `name` for OAuth providers that do not send `full_name`, and
// `avatar_url` when Google sends no `picture`.
const fallback = ownerColumnsFromAuthUser({
  user_metadata: { name: 'Pulkit Khowal', avatar_url: 'https://example.com/a.png' },
  app_metadata: { provider: 'email' },
});
assert.strictEqual(fallback.owner_first_name, 'Pulkit');
assert.strictEqual(fallback.owner_last_name, 'Khowal');
assert.strictEqual(fallback.google_picture_url, 'https://example.com/a.png', 'avatar_url is the picture fallback');
assert.strictEqual(fallback.auth_provider, 'email');

// Nothing to mirror from a session that carries nothing.
const blank = ownerColumnsFromAuthUser({ user_metadata: {}, app_metadata: {} });
assert.strictEqual(blank.owner_first_name, null);
assert.strictEqual(blank.owner_last_name, null);
assert.strictEqual(blank.google_picture_url, null);
assert.strictEqual(blank.auth_provider, null);
assert.strictEqual(blank.preferred_language, null);
assert.deepStrictEqual(ownerColumnsFromAuthUser(null), {}, 'no session → write nothing at all');

// Extra whitespace must not become an owner name.
const spaced = ownerColumnsFromAuthUser({ user_metadata: { full_name: '  Divyarth   Saini  ' } });
assert.strictEqual(spaced.owner_first_name, 'Divyarth');
assert.strictEqual(spaced.owner_last_name, 'Saini');

// ── Test 2: an order row carries the flat columns the dashboard reads ────────
console.log('\nTest 2: orderRowFromOrder');
const order = {
  id: 'DKN-1001',
  customer: { name: 'Divyarth Saini', whatsappNumber: '919588834592', address: 'Model Town, Jaipur' },
  items: [{ productId: 'p1', name: 'Maggi 2-Minute Noodles (70g)', quantity: 2, price: '₹15' }],
  total: 30,
  paymentMethod: 'COD',
  status: 'READY_FOR_PICKUP',
  timestamp: '2026-10-16T04:00:00.000Z',
  notes: 'Cash on Delivery',
};
const row = orderRowFromOrder(order, 'u1', '2026-10-16T05:00:00.000Z');
assert.strictEqual(row.external_id, 'DKN-1001');
assert.strictEqual(row.user_id, 'u1');
assert.strictEqual(row.total, 30);
assert.strictEqual(row.created_at, '2026-10-16T04:00:00.000Z');
assert.strictEqual(row.updated_at, '2026-10-16T05:00:00.000Z');
assert.strictEqual(row.customer_phone, '919588834592', 'the flat phone is written');
assert.strictEqual(row.customer_name, 'Divyarth Saini', 'the flat name is written');
assert.strictEqual(row.delivery_address, 'Model Town, Jaipur', 'the flat address is written');
assert.strictEqual(row.notes, 'Cash on Delivery', 'the note is written');
assert.deepStrictEqual(row.items, order.items, 'the JSONB item list is untouched');

// A row with no customer must still produce the flat columns, as nulls, so the
// column list never varies between rows.
const empty = orderRowFromOrder({ id: 'DKN-1002', total: 0 }, 'u1', '2026-10-16T05:00:00.000Z');
assert.strictEqual(empty.customer_phone, null);
assert.strictEqual(empty.customer_name, null);
assert.strictEqual(empty.delivery_address, null);
assert.strictEqual(empty.notes, null);

console.log('\n========================================');
console.log('🎉 ALL CLOUD ROW TESTS PASSED 🎉');
console.log('========================================');
