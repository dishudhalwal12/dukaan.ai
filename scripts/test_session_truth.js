import assert from 'assert';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveActiveUserId } from '../src/services/cloudSync.ts';
import { currentIdentity } from '../src/utils/localStore.ts';
import { listenToAuthState } from '../src/services/auth.ts';
import { supabase } from '../src/supabase.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
const ok = (message) => console.log(`✓ ${++n}: ${message}`);

console.log('--- RUNNING SESSION-TRUTH (ISSUE #70) TESTS ---');

// Mock localStorage if running outside a browser
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: {
      search: '',
      hash: '',
      origin: 'https://dukaan.ai',
      pathname: '/',
    },
    history: {
      replaceState: () => {},
    },
    document: { title: 'Dukaan.AI' },
  };
}

// ── Test 1: resolveActiveUserId rejects spoofed localStorage entry ───────────
console.log('\nTest 1: resolveActiveUserId ignores dukan-auth-user without session');
{
  localStorage.setItem('dukan-auth-user', JSON.stringify({ id: 'spoofed-user-id', email: 'spoofed@attacker.com' }));
  const resolved = await resolveActiveUserId();
  assert.strictEqual(
    resolved,
    null,
    'resolveActiveUserId must return null when no Supabase session exists, even with dukan-auth-user in localStorage'
  );
  ok('resolveActiveUserId returns null despite spoofed dukan-auth-user');
}

// ── Test 2: resolveActiveUserId still honors explicit userId ─────────────────
console.log('\nTest 2: resolveActiveUserId honors explicit userId');
{
  const resolved = await resolveActiveUserId('explicit-user-123');
  assert.strictEqual(resolved, 'explicit-user-123', 'explicit userId is returned immediately');
  ok('explicit userId passes through directly');
}

// ── Test 3: currentIdentity rejects spoofed dukan-auth-user ─────────────────
console.log('\nTest 3: currentIdentity falls back to guest without session token');
{
  localStorage.removeItem('dukan_supabase_auth_token');
  localStorage.setItem('dukan-auth-user', JSON.stringify({ id: 'spoofed-id', email: 'spoofed@attacker.com' }));
  const id = currentIdentity();
  assert.strictEqual(
    id,
    'guest',
    'currentIdentity must return guest when dukan_supabase_auth_token is missing'
  );
  ok('currentIdentity returns guest when only dukan-auth-user is present');
}

// ── Test 4: currentIdentity resolves with session token ──────────────────────
console.log('\nTest 4: currentIdentity resolves when session token exists');
{
  localStorage.setItem('dukan_supabase_auth_token', JSON.stringify({ access_token: 'fake-token' }));
  localStorage.setItem('dukan-auth-user', JSON.stringify({ id: 'valid-user-id', email: 'valid@example.com' }));
  const id = currentIdentity();
  assert.strictEqual(id, 'valid-user-id', 'currentIdentity returns user id when session token is present');
  ok('currentIdentity returns user id with valid session token');
  localStorage.removeItem('dukan_supabase_auth_token');
  localStorage.removeItem('dukan-auth-user');
}

// ── Test 5: listenToAuthState purges spoofed entry when no session exists ───
console.log('\nTest 5: listenToAuthState purges unconfirmed dukan-auth-user on init');
{
  localStorage.setItem('dukan-auth-user', JSON.stringify({ id: 'rogue-id', email: 'rogue@fake.com' }));

  let deliveredUser = undefined;
  let reportReceived = undefined;

  const unsubscribe = listenToAuthState((user, report) => {
    deliveredUser = user;
    reportReceived = report;
  });

  // Allow promise in getSession() to settle
  await new Promise((resolve) => setTimeout(resolve, 50));
  unsubscribe();

  assert.strictEqual(deliveredUser, null, 'listenToAuthState delivers null user when no session exists');
  assert.strictEqual(reportReceived?.confirmed, true, 'absence of session is confirmed');
  assert.strictEqual(
    localStorage.getItem('dukan-auth-user'),
    null,
    'listenToAuthState must purge dukan-auth-user when auth server confirms no session'
  );
  ok('listenToAuthState wipes spoofed dukan-auth-user from localStorage');
}

// ── Test 6: Source verification - App.tsx does not treat storage as session ──
console.log('\nTest 6: Source checks for App.tsx and cloudSync.ts');
{
  const appTsx = fs.readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
  const cloudSyncTs = fs.readFileSync(join(root, 'src', 'services', 'cloudSync.ts'), 'utf8');

  // App.tsx must not compute isAuthenticated from localStorage
  assert.ok(
    !appTsx.includes("localStorage.getItem('dukan-auth-user')"),
    'App.tsx must not read dukan-auth-user from localStorage to decide authentication'
  );
  ok('App.tsx does not read dukan-auth-user from localStorage');

  // cloudSync.ts must not read dukan-auth-user
  assert.ok(
    !cloudSyncTs.includes("localStorage.getItem('dukan-auth-user')"),
    'cloudSync.ts must not read dukan-auth-user from localStorage'
  );
  ok('cloudSync.ts does not read dukan-auth-user from localStorage');

  // currentUser state in App.tsx must initialize to null, not seeded from storage
  assert.ok(
    appTsx.includes('const [currentUser, setCurrentUser] = useState<User | null>(null);'),
    'currentUser in App.tsx must initialize to null'
  );
  ok('currentUser in App.tsx initializes to null (not seeded from localStorage)');
}

console.log('\n========================================');
console.log('🎉 ALL SESSION-TRUTH (ISSUE #70) TESTS PASSED! 🎉');
console.log('========================================');
