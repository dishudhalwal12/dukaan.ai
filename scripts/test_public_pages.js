import assert from 'assert';
import { readFileSync } from 'node:fs';
import { privacyHtml, supportHtml, termsHtml } from '../scripts/build-static-pages.mjs';

/**
 * The OpenAI listing review needs three public pages and a developer page that
 * names the clients. These checks fail if a route disappears, if a page needs a
 * sign-in, if the writing slips into dashes or marketing, or if a support contact
 * is rendered without being configured.
 */
console.log('--- RUNNING PUBLIC PAGE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const index = read('src/index.tsx');
const privacy = read('src/screens/public/PrivacyScreen.tsx');
const terms = read('src/screens/public/TermsScreen.tsx');
const support = read('src/screens/public/SupportScreen.tsx');
const connect = read('src/screens/ConnectScreen.tsx');

// ── 1. Routes exist, with the trailing-slash twin and no auth ───────────────
for (const route of ['/privacy', '/privacy/', '/terms', '/terms/', '/support', '/support/']) {
  assert.ok(vercel.rewrites.some((rule) => rule.source === route), `vercel.json must route ${route}`);
}
for (const entry of ["'/privacy'", "'/terms'", "'/support'"]) {
  assert.ok(index.includes(entry), `src/index.tsx must mount ${entry}`);
}
ok('three public routes exist, with trailing slashes, mounted outside the app shell');

// ── 2. Privacy says what is actually stored ────────────────────────────────
for (const phrase of ['email', 'password', 'address', 'location', 'order', 'shop']) {
  assert.match(privacy, new RegExp(phrase, 'i'), `privacy must mention ${phrase}`);
}
assert.match(privacy, /delete|remove/i, 'privacy must explain how to delete data');
assert.match(privacy, /revoke/i, 'privacy must explain revoking an assistant');
assert.match(privacy, /hashed/i, 'the log line is hashed, say so');
assert.match(privacy, /cash on delivery/i, 'no card data is stored, say why');
for (const claim of ['24 hours', '30 days', 'stays until you delete it', 'sensitive']) {
  assert.ok(privacy.includes(claim), `privacy must state the retention/consent fact: ${claim}`);
}
ok('the privacy page covers account, address, location, orders, logs, and deletion');
ok('the privacy page states retention timelines and treats location as opt in');

// ── 3. Terms state the trade, not a promise ────────────────────────────────
assert.match(terms, /cash on delivery/i);
assert.match(terms, /reject/i, 'a shop may reject an order');
assert.match(terms, /cancel/i, 'the cancel window exists');
assert.match(terms, /not the shop|independent/i, 'Dukaan is not the merchant');
ok('the terms describe COD, rejection, cancellation, and who the seller is');

// ── 4. Support never renders an unconfigured contact ───────────────────────
assert.match(support, /VITE_SUPPORT_EMAIL/);
assert.match(support, /VITE_SUPPORT_WHATSAPP/);
assert.match(support, /Settings/, 'when nothing is configured it points at the in-app help');
ok('support shows a configured contact, and degrades to in-app help');

// ── 5. Writing rules: no em dashes, no marketing filler ────────────────────
const pages = { privacy, terms, support, connect };
const banned = ['—', '–', 'seamlessly', 'effortless', 'unlock', 'empower', 'revolutionary', 'game-changer'];
for (const [name, source] of Object.entries(pages)) {
  for (const word of banned) {
    assert.ok(!source.includes(word), `${name} must not contain "${word}"`);
  }
}
ok('no em dashes and no sales language on any public page');

// ── 6. /connect names the clients your users have ──────────────────────────
for (const client of ['ChatGPT', 'Claude', 'Antigravity']) {
  assert.match(connect, new RegExp(client), `/connect must document ${client}`);
}
assert.match(connect, /https:\/\/dukaan-ai-hypnexis\.vercel\.app\/mcp|ENDPOINT/, '/connect must show the endpoint');
assert.match(connect, /mobile|phone/i, 'ChatGPT on a phone needs a note');
ok('/connect covers ChatGPT, Claude, Antigravity, and the phone case');

// ── 7. Each page sets its own title and description ───────────────────────
for (const [name, source] of Object.entries({ privacy, terms, support, connect })) {
  assert.match(source, /setPageMeta/, `${name} must set its own title and meta description`);
}
ok('every public page sets a title and description for search');

// ── 7b. The legal pages exist as real HTML for checkers without JS ────────
// OpenAI's metadata check fetches the privacy URL without running JavaScript and
// reported the React-only page as inaccessible.
const privacyStatic = privacyHtml();
const termsStatic = termsHtml();
const supportStatic = supportHtml();
for (const claim of ['Supabase', '24 hours', '30 days', 'sensitive', 'How long we keep it', 'Delete a saved address']) {
  assert.ok(privacyStatic.includes(claim), `static privacy must contain: ${claim}`);
}
for (const claim of ['cash on delivery', 'reject', 'cancel', 'independent business']) {
  assert.ok(termsStatic.includes(claim), `static terms must contain: ${claim}`);
}
assert.ok(supportStatic.includes('Help Center') || supportStatic.includes('mailto:') || supportStatic.includes('wa.me'), 'static support must show a contact or the in-app path');
for (const route of ['/privacy', '/privacy/', '/terms', '/terms/', '/support', '/support/']) {
  const rule = vercel.rewrites.find((entry) => entry.source === route);
  assert.ok(rule && rule.destination.endsWith('.html'), `${route} must serve a static page, not the app shell`);
}
ok('the legal pages are emitted as static HTML and the routes serve them');

// ── 7c. OpenAI domain verification challenge ──────────────────────────────
// The portal serves a token at the origin-root well-known URL and checks the body
// byte for byte. A missing file, a stray newline, or a binary content type fails
// the check, so all three are pinned here.
const challenge = read('public/.well-known/openai-apps-challenge');
assert.ok(challenge.length > 10, 'the challenge file must contain the token');
assert.strictEqual(challenge.trim(), challenge, 'no surrounding whitespace');
assert.ok(/^[A-Za-z0-9_-]+$/.test(challenge), 'the token is opaque characters only');
const challengeHeaders = vercel.headers.find((rule) => rule.source === '/.well-known/openai-apps-challenge');
assert.ok(challengeHeaders, 'a header rule exists for the challenge path');
assert.match(
  JSON.stringify(challengeHeaders.headers),
  /text\/plain/,
  'the challenge must be served as text/plain, not a binary type'
);
ok('the OpenAI domain challenge file is present, exact, and served as text');

// ── 8. Crawlers and hardening ──────────────────────────────────────────────
const robots = read('public/robots.txt');
const sitemap = read('public/sitemap.xml');
assert.match(robots, /Sitemap: https:\/\/dukaan-ai-hypnexis\.vercel\.app\/sitemap\.xml/);
for (const path of ['/connect', '/privacy', '/terms', '/support']) {
  assert.ok(sitemap.includes(`https://dukaan-ai-hypnexis.vercel.app${path}`), `sitemap must list ${path}`);
}
const security = vercel.headers.find((rule) => rule.source === '/(.*)');
assert.ok(security, 'a catch-all header rule exists');
const headerKeys = security.headers.map((h) => h.key.toLowerCase());
for (const key of ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy']) {
  assert.ok(headerKeys.includes(key), `missing ${key}`);
}
assert.match(JSON.stringify(security.headers), /geolocation=\(self\)/, 'the consent page needs geolocation for its own origin');
ok('robots.txt, sitemap.xml, and the security headers are in place');

console.log(`\nAll ${n} public page checks passed.`);
