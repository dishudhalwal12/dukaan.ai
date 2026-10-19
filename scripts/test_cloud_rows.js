import assert from 'assert';
import {
  ownerColumnsFromAuthUser,
  identityRowFromAuthUser,
  orderRowFromOrder,
  isMissingOptionalColumnError,
  stripOptionalOrderColumns,
} from '../src/utils/cloudRows.ts';

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

// ── Test 1b: the email is mirrored for every provider, and the identity row ──
// The email lives on the auth user, not in user_metadata, so an OAuth session
// that fills a name still left email NULL — and an email/password session, whose
// metadata is empty, left EVERY identity column NULL.
console.log('\nTest 1b: owner email + identityRowFromAuthUser');
const googleEmail = ownerColumnsFromAuthUser({
  email: 'divyanshu@gmail.com',
  user_metadata: { full_name: 'Divyanshu Saini', picture: 'https://lh3.googleusercontent.com/a/x.png', locale: 'en-IN' },
  app_metadata: { provider: 'google' },
});
assert.strictEqual(googleEmail.owner_email, 'divyanshu@gmail.com', 'the Google email is mirrored');

const emailUser = ownerColumnsFromAuthUser({
  email: 'owner@shop.com',
  user_metadata: {},
  app_metadata: { provider: 'email' },
});
assert.strictEqual(emailUser.owner_email, 'owner@shop.com', 'the email/password email is mirrored');
assert.strictEqual(emailUser.auth_provider, 'email');
assert.strictEqual(emailUser.owner_first_name, null, 'a name is never invented from the email local-part');
assert.strictEqual(emailUser.owner_last_name, null);

assert.strictEqual(
  ownerColumnsFromAuthUser({ user_metadata: {}, app_metadata: {} }).owner_email,
  null,
  'a session with no email mirrors no email',
);

// The identity row for the new user_identities table.
const idRow = identityRowFromAuthUser({
  email: 'owner@shop.com',
  email_confirmed_at: '2026-10-17T00:00:00Z',
  created_at: '2026-10-01T09:30:00Z',
  user_metadata: { full_name: 'Divyarth Saini', avatar_url: 'https://example.com/a.png' },
  app_metadata: { provider: 'email' },
});
assert.strictEqual(idRow.signup_at, '2026-10-01T09:30:00Z',
  'the upsert insert must carry signup_at or the NOT NULL column rejects it');
assert.strictEqual(idRow.email, 'owner@shop.com');
assert.strictEqual(idRow.email_verified, true);
assert.strictEqual(idRow.owner_first_name, 'Divyarth');
assert.strictEqual(idRow.owner_last_name, 'Saini');
assert.strictEqual(idRow.display_name, 'Divyarth Saini');
assert.strictEqual(idRow.avatar_url, 'https://example.com/a.png');
assert.strictEqual(idRow.auth_provider, 'email');

const idBlank = identityRowFromAuthUser({ email: null, user_metadata: {}, app_metadata: {} });
assert.strictEqual(idBlank.email, null);
assert.strictEqual(idBlank.email_verified, null, 'an unconfirmed signup is null, not false');
assert.strictEqual(idBlank.display_name, null);
assert.strictEqual(idBlank.avatar_url, null);
assert.deepStrictEqual(identityRowFromAuthUser(null), {}, 'no session -> write nothing at all');

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

console.log('\nTest 3: isMissingOptionalColumnError');
assert.strictEqual(isMissingOptionalColumnError({ code: 'PGRST204' }), true, 'PGRST204 means the column is absent');
assert.strictEqual(
  isMissingOptionalColumnError({ message: "Could not find the 'customer_name' column of 'orders' in the schema cache" }),
  true,
  'a schema-cache message means the column is absent',
);
// Anything else is a real failure and must NOT be swallowed by a retry.
assert.strictEqual(isMissingOptionalColumnError({ code: '23505', message: 'duplicate key value' }), false, 'a constraint violation is not a missing column');
assert.strictEqual(isMissingOptionalColumnError({ message: 'JWT expired' }), false, 'an auth error is not a missing column');
assert.strictEqual(isMissingOptionalColumnError(null), false, 'no error is not a missing column');
assert.strictEqual(isMissingOptionalColumnError(undefined), false);
assert.strictEqual(isMissingOptionalColumnError(new Error('network down')), false, 'a plain Error is not a missing column');

console.log('✓ Test 3 Passed');

console.log('\nTest 4: stripOptionalOrderColumns');
const stripped = stripOptionalOrderColumns([row])[0];
assert.deepStrictEqual(
  Object.keys(stripped).sort(),
  ['created_at', 'customer', 'external_id', 'items', 'payment_method', 'status', 'total', 'updated_at', 'user_id'],
  'exactly the four optional columns are gone',
);
assert.strictEqual(stripped.external_id, row.external_id, 'identity is kept');
assert.strictEqual(stripped.user_id, row.user_id, 'ownership is kept');
assert.deepStrictEqual(stripped.customer, row.customer, 'the JSONB is kept');
assert.strictEqual(stripped.total, row.total, 'the amount is kept');
assert.ok(!('customer_phone' in stripped) && !('notes' in stripped), 'the flat columns are gone');
assert.deepStrictEqual(stripOptionalOrderColumns([]), [], 'an empty batch stays empty');
assert.deepStrictEqual(
  Object.keys(stripOptionalOrderColumns([row])[0]),
  Object.keys(stripped),
  'every row is shaped alike',
);
console.log('✓ Test 4 Passed');

console.log('\n========================================');
console.log('🎉 ALL CLOUD ROW TESTS PASSED 🎉');
console.log('========================================');
