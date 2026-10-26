import assert from 'assert';
import { clearCustomerLocation, getCustomerProfile, saveCustomerLocation } from '../mcp/data.js';

/**
 * The saved-location writer is the one place the consent page's data lands.
 * These checks pin the two things that would be silent disasters: blanking the
 * customer's name/phone on an upsert, and writing a position the tools will read
 * as real. They use a recording stub, so no network is involved.
 */
console.log('--- RUNNING MCP CUSTOMER-DATA TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const userId = '11111111-1111-4111-8111-111111111111';

/** Records what the writer sent, and answers like PostgREST's .single(). */
function stubClient() {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, op: null, payload: null, options: null, filter: null, select: null };
      calls.push(call);
      const api = {
        select(columns) {
          call.select = columns;
          return api;
        },
        upsert(payload, options) {
          call.op = 'upsert';
          call.payload = payload;
          call.options = options;
          return api;
        },
        update(payload) {
          call.op = 'update';
          call.payload = payload;
          return api;
        },
        delete() {
          call.op = 'delete';
          return api;
        },
        eq(column, value) {
          call.filter = { column, value };
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          return Promise.resolve({ data: { ...call.payload }, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return client;
}

// ── 1. The upsert cannot blank the profile ──────────────────────────────────
const client = stubClient();
const saved = await saveCustomerLocation(client, userId, { lat: 26.9124, lng: 75.7873, accuracyM: 18, source: 'gps' });
const upsert = client.calls[0];
assert.strictEqual(upsert.table, 'customer_profiles');
assert.strictEqual(upsert.op, 'upsert');
assert.deepStrictEqual(upsert.options, { onConflict: 'user_id' });
assert.deepStrictEqual(
  Object.keys(upsert.payload).sort(),
  [
    'location_accuracy_m',
    'location_captured_at',
    'location_label',
    'location_lat',
    'location_lng',
    'location_source',
    'updated_at',
    'user_id',
  ],
  'only location keys are sent, so ON CONFLICT cannot overwrite full_name or phone'
);
assert.strictEqual(upsert.payload.location_lat, 26.9124);
assert.strictEqual(upsert.payload.location_lng, 75.7873);
assert.strictEqual(upsert.payload.location_accuracy_m, 18);
assert.strictEqual(upsert.payload.location_source, 'gps');
assert.ok(upsert.payload.location_captured_at, 'a capture time is always written');
assert.strictEqual(saved.location_lat, 26.9124);
ok('saving a position never touches the name or the delivery phone');

// ── 2. Bad positions never reach the row ────────────────────────────────────
for (const [lat, lng, label] of [
  [null, 75.7873, 'a missing latitude'],
  [26.9124, undefined, 'a missing longitude'],
  [91, 75.7873, 'a latitude past the pole'],
  [26.9124, 181, 'a longitude past the antimeridian'],
]) {
  const c = stubClient();
  await assert.rejects(
    () => saveCustomerLocation(c, userId, { lat, lng, source: 'gps' }),
    (error) => error.code === 'location_invalid',
    `${label} must be refused`
  );
  assert.strictEqual(c.calls.length, 0, `${label} must not reach the database`);
}
ok('a half or impossible position is refused before the write');

// ── 3. Clearing removes every location column ──────────────────────────────
const clearClient = stubClient();
await clearCustomerLocation(clearClient, userId);
const clear = clearClient.calls[0];
assert.strictEqual(clear.op, 'update');
assert.deepStrictEqual(clear.filter, { column: 'user_id', value: userId });
for (const column of [
  'location_lat',
  'location_lng',
  'location_accuracy_m',
  'location_source',
  'location_label',
  'location_captured_at',
]) {
  assert.strictEqual(clear.payload[column], null, `${column} is cleared`);
}
ok('removing the position clears every location column and nothing else');

// ── 4. The profile read tolerates an unmigrated project ────────────────────
const readClient = stubClient();
await getCustomerProfile(readClient, userId);
const read = readClient.calls[0];
assert.strictEqual(read.op, null);
assert.strictEqual(read.select, '*', 'a column list would break every tool until the migration runs');
assert.deepStrictEqual(read.filter, { column: 'user_id', value: userId });
ok('the profile is read with select(*) so an unmigrated project still works');

console.log(`\nAll ${n} customer-data checks passed.`);
