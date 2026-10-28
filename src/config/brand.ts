/**
 * The brand, in one place.
 *
 * The product printed three spellings of its own name across shipped screens
 * ("Dukaan.AI" in `index.html`, "Dukan.AI" on the login screen and in the brand
 * guide, "दुकान.एआई" in one locale bundle, "Dukan AI" in the bot logs), and two
 * accents on two different page themes. Every surface that shows the name, the
 * accent or the type stack now reads it from here, and `scripts/test_brand.js`
 * fails when a literal drifts away from this file.
 *
 * `index.html` and `public/site.webmanifest` cannot import a module, so they
 * carry the same values as literals and the test compares them against this
 * file. Change a value here, change it there, run `npm test`.
 *
 * What is deliberately NOT renamed: the `dukaan-` / `dukan-` localStorage
 * prefixes, the `#dukaan-tour-*` CSS hooks, the `MCP-` order prefix and the
 * Supabase project. Those are contracts with data already on shopkeepers'
 * phones and in the order ledger. A rename that touches them loses carts and
 * order history for no visible gain.
 */

export const BRAND = {
  /** The product name, as written in running text. */
  name: 'Nukkad',
  /** The wordmark: the same name, capitalised the same way, on the splash. */
  wordmark: 'Nukkad',
  /** Five words next to the wordmark. */
  descriptor: 'AI commerce for the corner shop',
  /** The one line that explains the product to a shopkeeper. */
  tagline: 'The corner shop, now answering on WhatsApp.',
  /** Title tag and social card headline. */
  pageTitle: 'Nukkad — the corner shop, now answering on WhatsApp',
  /** Store description, manifest description, social card description. */
  description: 'AI-powered commerce for Indian shops: WhatsApp orders, stock and insights in one POS.',
  /** The origin the deployed build actually answers on. */
  origin: 'https://dukaan-ai-hypnexis.vercel.app',
  /** Where a client connects when VITE_MCP_URL is unset. */
  mcpEndpoint: 'https://dukaan-ai-hypnexis.vercel.app/mcp',
} as const;

/**
 * Colour, with the contrast ratio each pair is allowed to be used on.
 *
 * `neutral` used to be #737373, which is 4.43:1 on black and 2.90:1 on the
 * raised surface: readable-looking on a laptop and unreadable on a shop
 * counter in daylight. The floor is 4.5:1 against `surfaceRaised`, the lightest
 * background any text sits on.
 */
export const BRAND_COLOURS = {
  ink: '#000000',
  surface: '#1A1A1A',
  surfaceRaised: '#2D2D2D',
  accent: '#E6E6FA',
  accentHover: '#D8D8F0',
  /** Deep accent for light pages. 9.04:1 on white; the pale accent above is 1.23:1 there and never goes on white. */
  accentInk: '#3A3E98',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  /** Muted text floor. 4.66:1 on the raised surface, 7.10:1 on black. */
  textMuted: '#969696',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
} as const;

/**
 * Type.
 *
 * Manrope carries the Latin UI, the wordmark and every price. The Noto script
 * families carry the six other languages this build ships: Manrope has no
 * Devanagari, Gurmukhi, Gujarati, Tamil, Kannada or Arabic glyph at all, so
 * before this every non-Latin screen silently fell back to whatever font the
 * phone happened to have. One request, and the browser downloads only the
 * subsets a page actually paints (unicode-range).
 */
export const BRAND_FONTS = {
  display: 'Manrope',
  /**
   * One entry per script this build ships. `weights` is the range the family
   * actually publishes: asking Noto Naskh Arabic for 800 makes Google drop it
   * from the response without an error, and Urdu silently loses the brand font.
   */
  scriptFamilies: [
    { family: 'Noto Naskh Arabic', weights: '400..700' },
    { family: 'Noto Sans Devanagari', weights: '400..800' },
    { family: 'Noto Sans Gujarati', weights: '400..800' },
    { family: 'Noto Sans Gurmukhi', weights: '400..800' },
    { family: 'Noto Sans Kannada', weights: '400..800' },
    { family: 'Noto Sans Tamil', weights: '400..800' },
  ],
  /** Kept last: a device that fails the network still has readable text. */
  systemFallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
} as const;

/**
 * Which family draws each shipped language. English gets the display face;
 * everything else gets the Noto family for its script. `scripts/test_brand.js`
 * checks that every family listed here is actually in the fonts request, because
 * a family that is named in the stack but never downloaded is a silent fallback.
 */
export const SCRIPT_FAMILY_BY_LANGUAGE = {
  en: 'Manrope',
  hi: 'Noto Sans Devanagari',
  ur: 'Noto Naskh Arabic',
  ta: 'Noto Sans Tamil',
  pa: 'Noto Sans Gurmukhi',
  gu: 'Noto Sans Gujarati',
  kn: 'Noto Sans Kannada',
} as const;

export const FONT_STACK = [
  BRAND_FONTS.display,
  ...BRAND_FONTS.scriptFamilies.map((entry) => entry.family),
  ...BRAND_FONTS.systemFallback,
].join(', ');

/**
 * Weights the UI actually asks for: 400 (body), 500 (medium), 600 (semibold,
 * 95 uses), 700 (bold), 800 (display). 600 was missing from the old request, so
 * every `font-semibold` was a synthesised bold: thicker stems, smeared joins.
 */
export const FONT_WEIGHTS = '400..800';

/** One request for all seven languages. index.html must carry this exact href. */
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    `family=${BRAND_FONTS.display.replace(/ /g, '+')}:wght@${FONT_WEIGHTS}`,
    ...BRAND_FONTS.scriptFamilies.map(
      (entry) => `family=${entry.family.replace(/ /g, '+')}:wght@${entry.weights}`,
    ),
  ].join('&') +
  '&display=swap';

export interface TypeRole {
  role: string;
  /** Tailwind classes, so a screen can copy the row instead of inventing one. */
  className: string;
  use: string;
}

/**
 * The scale. Five roles, not thirteen: hierarchy comes from size and weight on
 * one family, which is what the dark UI can carry without another font download.
 */
export const TYPE_SCALE: TypeRole[] = [
  {
    role: 'Display',
    className: 'font-manrope font-extrabold text-4xl tracking-tight leading-[1.1]',
    use: 'Wordmark, one per screen. Never for a section title.',
  },
  {
    role: 'Screen title',
    className: 'font-manrope font-bold text-2xl tracking-tight leading-snug',
    use: 'The name of the screen the shopkeeper is on.',
  },
  {
    role: 'Section label',
    className: 'font-sans font-bold text-sm uppercase tracking-wider',
    use: 'Groups a block of content. Accent colour, never white.',
  },
  {
    role: 'Body',
    className: 'font-sans font-normal text-base leading-relaxed',
    use: 'Sentences. 16px is the floor: 12px at weight 400 was the old body size.',
  },
  {
    role: 'Meta',
    className: 'font-sans font-medium text-sm leading-normal',
    use: 'Timestamps, stock counts, helper lines. Muted colour, never below 13px.',
  },
  {
    role: 'Number',
    className: 'font-manrope font-bold tabular-nums',
    use: 'Prices, totals, quantities. Tabular figures so columns line up in a bill.',
  },
];

/**
 * Indic scripts carry vowel marks above the headline stroke and below the
 * baseline, so they need more leading than Latin at the same size.
 */
export const LINE_HEIGHT = {
  latin: 1.45,
  indic: 1.7,
} as const;
