import assert from 'assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Source-level checks for the MCP consent page.
 *
 * The page is the only customer-facing auth surface Dukaan has, and three things
 * there are easy to regress without any runtime error: the Google button drifting
 * away from the POS sheet, the location sheet losing its customer copy, and the
 * consent page borrowing the merchant app's OAuth marker (which would make the
 * POS think a shopkeeper login is pending).
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

console.log('--- RUNNING MCP CONSENT UI TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const screen = read('src/screens/OAuthConsentScreen.tsx');
const sheet = read('src/components/LocationModal.tsx');
const service = read('src/services/customerLocation.ts');

// 1. Google sign-in looks like the POS onboarding sheet, not a text link.
assert.match(screen, /import \{ GoogleIcon \}/, 'the consent page uses the same Google mark as the POS sheet');
assert.match(screen, /Continue with Google/, 'the button says "Continue with Google"');
assert.match(screen, /By continuing you agree to our/, 'the consent line matches the POS sheet');
assert.match(screen, /or email/i, 'the email half is still separated by the OR EMAIL divider');
assert.match(screen, /Sign In with Email/, 'the email submit matches the POS sheet');
assert.match(screen, /onClick=\{\(\) => setShowPrivacy\(true\)\}/, 'the privacy line opens a real policy');
assert.match(screen, /const PrivacySheet/, 'the policy is rendered on the page, not linked to a dead URL');
assert.ok(
  !/import[^\n]*PrivacyPolicyScreen/.test(screen),
  'the merchant policy screen needs a LanguageProvider this standalone page does not mount'
);
ok('the Google button, consent line, and email half match the POS sheet');

// 2. The location step exists, uses the shared sheet, and is skippable.
assert.match(screen, /<LocationModal/, 'the consent page reuses the onboarding location sheet');
assert.match(screen, /audience="customer"/, 'the sheet is rendered with customer copy');
assert.match(screen, /onSetupLater=\{skipLocation\}/, 'a customer can decline without blocking approval');
assert.match(sheet, /audience\?: 'store' \| 'customer'/, 'the sheet supports both audiences');
assert.match(sheet, /Share your location\?/, 'customer copy asks rather than instructs');
assert.match(sheet, /Delivery still needs a full address/, 'customer copy does not promise delivery from a fix');
ok('the location sheet is shared, customer-worded, and optional');

// 3. The position is saved to the customer's own row, and can be removed.
assert.match(screen, /saveCapturedCustomerLocation/, 'the captured fix is written to the profile');
assert.match(screen, /removeCustomerLocation/, 'the customer can delete it again');
assert.match(screen, /schema_pending/, 'a project without the migration degrades instead of blocking');
assert.match(service, /customer_profiles/, 'the service writes the customer_profiles row');
assert.match(service, /onConflict: 'user_id'/, 'an existing profile is updated, not duplicated');
assert.match(service, /location_lat/, 'the column names match the migration');
ok('the position is saved to the customer profile and can be removed');

// 4. The consent page must not borrow the merchant OAuth marker.
assert.ok(
  !screen.includes("'dukan-oauth-in-progress'") && !screen.includes('"dukan-oauth-in-progress"'),
  'the consent page must not write the merchant app\'s OAuth marker'
);
assert.match(screen, /dukan-oauth-consent-in-progress/, 'it uses its own marker');
assert.match(screen, /GOOGLE_STUCK_MS/, 'a closed Google window recovers the button');
ok('the consent page keeps its OAuth state out of the merchant shell');

// 5. The light theme is gone from this surface.
for (const stale of ['bg-gray-50', 'bg-white rounded-2xl', 'text-[#3A3E98]', 'bg-[#27AE60]']) {
  assert.ok(!screen.includes(stale), `the old light styling ("${stale}") must not return`);
}
assert.match(screen, /bg-\[#1A1A1A\]/, 'the card uses the POS charcoal surface');
assert.match(screen, /bg-\[#E6E6FA\]/, 'primary actions use the POS off-white accent');
ok('the page uses the POS black and off-white surfaces only');

console.log(`\nAll ${n} consent UI checks passed.`);
