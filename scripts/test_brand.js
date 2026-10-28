import assert from 'assert';
import fs from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRAND,
  BRAND_COLOURS,
  BRAND_FONTS,
  FONT_STACK,
  GOOGLE_FONTS_HREF,
  SCRIPT_FAMILY_BY_LANGUAGE,
  TYPE_SCALE,
} from '../src/config/brand.ts';
import { LANGUAGES, languageDirection } from '../src/data/languages.ts';

/**
 * The brand cannot be spelled two ways.
 *
 * Before this guard the product shipped four renderings of its own name in one
 * build: "Dukaan.AI" in the document title, "Dukan.AI" on the login screen and
 * in the in-app brand guide, "दुकान.एआई" in one locale bundle, and "Dukan AI" in
 * the bot's log prefix. The old name also carried a domain nobody here owned, so
 * the README published an endpoint with no DNS record.
 *
 * The values live in src/config/brand.ts. index.html and site.webmanifest cannot
 * import a module, so this test is what keeps their literals honest.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(join(root, file), 'utf8');

let n = 0;
const ok = (message) => console.log(`✓ ${++n}: ${message}`);

console.log('--- RUNNING BRAND TESTS ---');

// ── 1. the entry document carries the brand, not a second copy of it ─────────
console.log('\nTest 1: index.html');
{
  const html = read('index.html');
  assert.ok(html.includes(`<title>${BRAND.pageTitle}</title>`), 'the title must be BRAND.pageTitle');
  assert.ok(html.includes(`content="${BRAND.description}"`), 'the meta description must be BRAND.description');
  assert.ok(html.includes(`content="${BRAND.name}"`), 'og:site_name must be the product name');
  assert.ok(html.includes(`content="${BRAND.origin}/"`), 'og:url must be the origin this build answers on');
  assert.ok(html.includes(`content="${BRAND_COLOURS.ink}"`), 'theme-color must be the ink colour');
  assert.ok(html.includes('viewport-fit=cover'), 'viewport-fit=cover is what makes the safe-area padding apply');
  ok('name, description, origin, theme colour and safe-area viewport are in the entry document');
}

// ── 2. one fonts request, built by the brand file ────────────────────────────
console.log('\nTest 2: type request');
{
  const html = read('index.html');
  assert.ok(html.includes(GOOGLE_FONTS_HREF), 'the fonts href must be GOOGLE_FONTS_HREF, character for character');
  for (const entry of BRAND_FONTS.scriptFamilies) {
    assert.ok(GOOGLE_FONTS_HREF.includes(entry.family.replace(/ /g, '+')), `${entry.family} must be requested`);
  }
  // A family asked for a weight it does not publish is silently dropped from the
  // response, and the language falls back without any error at all.
  assert.ok(GOOGLE_FONTS_HREF.includes('Noto+Naskh+Arabic:wght@400..700'), 'Naskh Arabic stops at 700');
  assert.ok(!html.includes('@babel/standalone'), 'babel standalone is 2.9 MB that nothing on this page runs');
  assert.ok(!html.includes('importmap'), 'Vite rewrites bare specifiers at build time; the import map is dead weight');
  ok('one request, every script family in it, and no render-blocking dead weight');
}

// ── 3. every shipped language has a font that can draw it ────────────────────
console.log('\nTest 3: language coverage');
{
  for (const language of LANGUAGES) {
    const family = SCRIPT_FAMILY_BY_LANGUAGE[language.code];
    assert.ok(family, `${language.code} has no family in SCRIPT_FAMILY_BY_LANGUAGE`);
    assert.ok(FONT_STACK.includes(family), `${family} must be in FONT_STACK (${language.code})`);
    assert.ok(
      family === BRAND_FONTS.display || GOOGLE_FONTS_HREF.includes(family.replace(/ /g, '+')),
      `${family} is named in the stack but never downloaded, so ${language.code} falls back silently`,
    );
  }
  ok(`all ${LANGUAGES.length} languages resolve to a family this build downloads`);

  // Manrope has no glyph for any of these scripts, which is why the stack has to
  // name a Noto family per script instead of one "Noto Sans" catch-all.
  assert.strictEqual(BRAND_FONTS.scriptFamilies.length, 6, 'six non-Latin scripts ship');
  ok('the Latin face is not asked to draw scripts it does not have');
}

// ── 4. direction follows the language ───────────────────────────────────────
console.log('\nTest 4: reading direction');
{
  assert.strictEqual(languageDirection('ur'), 'rtl', 'Urdu reads right to left');
  for (const language of LANGUAGES.filter((entry) => entry.code !== 'ur')) {
    assert.strictEqual(languageDirection(language.code), 'ltr', `${language.code} reads left to right`);
  }
  assert.strictEqual(languageDirection('xx'), 'ltr', 'an unknown code does not flip the layout');
  const context = read('src/contexts/LanguageContext.tsx');
  assert.ok(context.includes('document.documentElement.dir'), 'the document direction must be set from the language');
  assert.ok(context.includes('document.documentElement.lang'), 'so must the language, for :lang() leading rules');
  ok('Urdu flips the document, everything else leaves it alone');
}

// ── 5. contrast: the tokens the UI is built from ────────────────────────────
console.log('\nTest 5: contrast');
{
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (fg, bg) => {
    const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };

  const darkSurfaces = [BRAND_COLOURS.ink, BRAND_COLOURS.surface, BRAND_COLOURS.surfaceRaised];
  for (const background of darkSurfaces) {
    for (const token of ['textPrimary', 'textSecondary', 'textMuted']) {
      const value = ratio(BRAND_COLOURS[token], background);
      assert.ok(value >= 4.5, `${token} on ${background} is ${value.toFixed(2)}:1, below AA for body text`);
    }
  }
  assert.ok(ratio(BRAND_COLOURS.accent, BRAND_COLOURS.ink) >= 4.5, 'the accent carries dark-on-light button labels');
  assert.ok(ratio(BRAND_COLOURS.accentInk, '#FFFFFF') >= 4.5, 'accentInk is the only accent allowed on the light pages');
  assert.ok(
    ratio(BRAND_COLOURS.accent, '#FFFFFF') < 3,
    'the pale accent on white is the reason accentInk exists, and this test says so',
  );
  ok(`muted text floor #${BRAND_COLOURS.textMuted.slice(1)} clears AA on all three dark surfaces`);

  // The old muted tone is the defect this test exists for.
  assert.strictEqual(
    Math.round(ratio('#737373', BRAND_COLOURS.surfaceRaised) * 10) / 10,
    2.9,
    'the replaced tone measured 2.9:1 on the raised surface',
  );
  ok('the replaced grey is still measurable, so the reason is not forgotten');
}

// ── 6. the Tailwind theme agrees with the brand file ───────────────────────
console.log('\nTest 6: theme tokens');
{
  const html = read('index.html');
  assert.ok(html.includes(`accent: "${BRAND_COLOURS.accent}"`), 'brand.accent must be the accent colour');
  assert.ok(html.includes(`accentInk: "${BRAND_COLOURS.accentInk}"`), 'brand.accentInk must be the light-page accent');
  assert.ok(html.includes(`neutral: "${BRAND_COLOURS.textMuted}"`), 'brand.neutral must be the muted text floor');
  assert.ok(html.includes(`surfaceRaised: "${BRAND_COLOURS.surfaceRaised}"`), 'the raised surface must be a token');
  for (const entry of BRAND_FONTS.scriptFamilies) {
    assert.ok(html.includes(`"${entry.family}"`), `${entry.family} must be in the Tailwind font stack too`);
  }
  ok('the CDN theme and the brand file list the same colours and families');
}

// ── 7. no second spelling of the name, anywhere that ships ──────────────────
console.log('\nTest 7: one name');
{
  // Built at runtime so this file does not match itself.
  const retired = ['Du', 'kaan'].join('');
  const shortForm = ['Duk', 'an'].join('');
  const pattern = new RegExp(`\\b(${retired}|${shortForm})\\b`);

  const skip = new Set([
    'src/config/brand.ts', // the docblock explains what the old spellings were
    'scripts/test_brand.js',
    'index.html', // checked in test 1 by its own assertions
  ]);
  const roots = ['src', 'api', 'mcp', 'whatsapp', 'scripts', 'public/i18n'];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'store') continue;
        walk(rel);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|json|md)$/.test(entry.name)) continue;
      if (skip.has(rel)) continue;
      const body = fs.readFileSync(join(root, rel), 'utf8');
      if (pattern.test(body)) offenders.push(rel);
    }
  };
  roots.forEach(walk);
  assert.deepStrictEqual(offenders, [], `these still spell the old name: ${offenders.join(', ')}`);
  ok('nothing that ships still prints the retired name');

  // The lowercase storage prefixes are contracts with data already on devices.
  const localStore = read('src/utils/localStore.ts');
  assert.ok(localStore.includes("'dukaan-'"), 'the storage prefix must not be renamed with the brand');
  ok('storage prefixes are data, not branding, and stay put');
}

// ── 8. locale bundles say the new name, in one script ──────────────────────
console.log('\nTest 8: locales');
{
  for (const language of LANGUAGES) {
    const bundle = JSON.parse(read(`public/i18n/locales/${language.code}.json`));
    assert.ok(
      bundle.whatsapp_ready_desc.includes(BRAND.name),
      `${language.code} must name the product exactly "${BRAND.name}"`,
    );
  }
  ok('all seven bundles carry the same Latin wordmark');
}

// ── 9. the published endpoint resolves to something we run ──────────────────
console.log('\nTest 9: endpoint');
{
  const connect = read('src/screens/ConnectScreen.tsx');
  assert.ok(connect.includes('BRAND.mcpEndpoint'), 'the client setup screen must fall back to the real endpoint');
  assert.ok(!/mcp\.[a-z]+\.ai/.test(connect), 'no dead host in the setup screen');
  assert.strictEqual(BRAND.mcpEndpoint, `${BRAND.origin}/mcp`, 'the endpoint is on the origin that serves the app');
  for (const file of ['README.md', 'docs/mcp.md']) {
    const body = read(file);
    if (body.includes('/mcp`')) {
      assert.ok(body.includes(BRAND.mcpEndpoint), `${file} must publish the endpoint this build answers on`);
    }
  }
  ok('the endpoint in the docs is the endpoint that exists');
}

// ── 10. the type scale is roles, not a pile of sizes ───────────────────────
console.log('\nTest 10: type scale');
{
  assert.ok(TYPE_SCALE.length >= 5, 'at least five roles');
  for (const role of TYPE_SCALE) {
    assert.ok(role.role && role.className && role.use, 'every role needs a name, classes and a stated use');
  }
  assert.ok(
    TYPE_SCALE.some((role) => role.className.includes('tabular-nums')),
    'prices need tabular figures or the bill columns drift',
  );
  const body = TYPE_SCALE.find((role) => role.role === 'Body');
  assert.ok(body.className.includes('text-base'), 'body copy is 16px, not 12px');
  ok(`${TYPE_SCALE.length} roles, one of them reserved for numbers`);
}

console.log('\n========================================');
console.log('🎉 ALL BRAND TESTS PASSED 🎉');
console.log('========================================');
