import assert from 'assert';
import { isIos, isInAppWebView, browserHandoffUrl } from '../src/utils/openInBrowser.ts';

console.log('--- RUNNING IN-APP BROWSER DETECTION TESTS ---');

const ok = (message) => console.log(`✓ ${message}`);

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36; wv)';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';

// ── Test 1: Android WebView is an in-app browser ────────────────────────────
console.log('\nTest 1: Android WebView');
assert.strictEqual(isInAppWebView(ANDROID_WEBVIEW), true, 'the "; wv)" marker means an Android WebView');
assert.strictEqual(isInAppWebView(ANDROID_CHROME), false, 'real Chrome on Android can hand off to itself');
ok('Android WebView detected, Chrome left alone');

// ── Test 2: iOS in-app browsers are detected, real Safari is not ────────────
console.log('\nTest 2: iOS');
assert.strictEqual(isInAppWebView(IPHONE_IN_APP), true, 'AppleWebKit on iOS with no Safari/ token is an in-app view');
assert.strictEqual(isInAppWebView(IPHONE_SAFARI), false, 'real Safari keeps its Safari/ token');
ok('iOS in-app detected, Safari left alone');

// ── Test 3: desktop and empty user agents are not in-app ────────────────────
console.log('\nTest 3: desktops are never in-app');
for (const ua of [MAC_CHROME, MAC_FIREFOX, '', 'garbage']) {
  assert.strictEqual(isInAppWebView(ua), false, `not in-app: ${ua.slice(0, 40) || '(empty)'}`);
}
ok('desktop and empty UAs are left alone');

// ── Test 4: the known app webview markers ───────────────────────────────────
console.log('\nTest 4: app markers');
for (const marker of ['FBAN', 'FBAV', 'FB_IAB', 'Instagram', 'Twitter', 'Line/', 'GSA/']) {
  assert.strictEqual(
    isInAppWebView(`Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 ${marker} Chrome/120 Mobile Safari/537.36`),
    true,
    `${marker} is an app webview`
  );
}
ok('Facebook, Instagram, Twitter, Line and the Google app are detected');

// ── Test 5: isIos ───────────────────────────────────────────────────────────
console.log('\nTest 5: isIos');
for (const ua of [IPHONE_SAFARI, IPHONE_IN_APP, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1']) {
  assert.strictEqual(isIos(ua), true, 'iOS device');
}
for (const ua of [ANDROID_CHROME, MAC_CHROME]) {
  assert.strictEqual(isIos(ua), false, 'not iOS');
}
ok('iPhone and iPad detected, Android and macOS not');

// ── Test 6: the hand-off URL targets Chrome and carries a fallback ──────────
console.log('\nTest 6: browserHandoffUrl');
const target = 'https://app.example/confirm?token_hash=abc&type=signup';
const intent = browserHandoffUrl(target);
assert.ok(intent.startsWith('intent://'), 'an Android intent URL');
assert.ok(intent.includes('scheme=https;'), 'the scheme is carried over');
assert.ok(intent.includes('package=com.android.chrome;'), 'Chrome is named explicitly');
assert.ok(intent.endsWith('end'), 'the intent is terminated');
assert.ok(intent.includes('token_hash=abc'), 'the original link survives in the intent target');

const fallback = intent.match(/S\.browser_fallback_url=([^;]+);/)[1];
assert.strictEqual(decodeURIComponent(fallback), target, 'the fallback decodes back to the exact link');
ok('hand-off targets Chrome and falls back to the same link');

// ── Test 7: an existing fragment cannot truncate the intent ─────────────────
console.log('\nTest 7: fragments');
const withFragment = browserHandoffUrl('https://app.example/confirm?token_hash=abc&type=signup#section');
assert.strictEqual(
  (withFragment.match(/#/g) || []).length,
  1,
  'only the # of "#Intent;" may remain, or the intent is truncated'
);
assert.ok(!withFragment.includes('section'), 'the app fragment is dropped, not smuggled into the intent');
ok('a target fragment is dropped rather than truncating the intent');

console.log('\n========================================');
console.log('🎉 ALL IN-APP BROWSER TESTS PASSED! 🎉');
console.log('========================================');