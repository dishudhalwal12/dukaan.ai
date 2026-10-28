# Nukkad brand decisions

This file records the decisions behind the brand: the name, the type, the colours,
and the UI/UX defects the decisions were made to fix. Values live in
[`src/config/brand.ts`](../src/config/brand.ts); `scripts/test_brand.js` fails when
a shipped screen drifts from them.

---

## 1. The name

### What the old name cost

`Dukaan` is the Hindi, Urdu, Punjabi and Gujarati word for *shop*. It described the
category, not the product, and four things had already gone wrong with it:

| Problem | Evidence |
|---|---|
| The build printed four spellings | `index.html` title "Dukaan.AI", `LoginScreen` and the brand guide "Dukan.AI", `hi.json` "दुकान.एआई", `ur.json` "دکان.اےآئی", bot logs "Dukan AI" |
| The name is a competitor's | `https://mydukaan.io` answers 200 with `<title>Dukaan - Enterprise Ecommerce Platform for Businesses</title>` |
| The domain is not ours | `dukaan.ai` resolves to `launch1/2.spaceship.net` and serves `<title>dukaan.ai for sale | Spaceship.com</title>` |
| The published endpoint did not exist | `README.md` and `docs/mcp.md` handed out `https://mcp.dukaan.ai/mcp`; that host is `NXDOMAIN` |
| The word is not in two of the seven languages | Tamil for shop is கடை, Kannada is ಅಂಗಡಿ. `Dukaan` means nothing on those screens |

A name a shopkeeper cannot spell after hearing it once fails the only test that
matters at a counter.

### What was considered

DNS checked on 2026-10-28 with `dig NS <name>.ai @1.1.1.1`. "No delegation" means
nothing answers there today; it is not a promise that a registrar will sell it.

| Name | Meaning | Sayable in one try | Pan-Indic | `.ai` as checked | Keeps the "D" mark |
|---|---|---|---|---|---|
| Dukaan | shop | yes | 4 of 7 | parked for sale | yes |
| Dukan | nothing, a misspelling | yes | 4 of 7 | parked | yes |
| **Nukkad** | street corner, the spot a neighbourhood gathers | yes | Hindi, Urdu, Punjabi, Gujarati native; transliterates cleanly | **no delegation (NXDOMAIN)** | no |
| Chowk | market square | yes | strongest, Sanskritic root | no delegation | no |
| Dwaar | door | yes | Sanskritic | live on Cloudflare | yes |
| Dastak | knock | yes | Hindi, Urdu, Marathi | parked by a broker | yes |
| Galli | lane | yes | Hindi, Urdu | parked by a broker | no |

### The decision: **Nukkad**

- It is the word for the thing the product sells. The tagline already said "the
  shop around the corner"; now the name says it too.
- It is the only shortlist name with nothing served on its `.ai` domain.
- It survives without the `.AI` suffix, which was a 2023 tic and forced a
  three-syllable pronunciation ("dukaan dot a i").
- It keeps the warm, small-scale register of the product. `Dwaar` and `Dastak` keep
  the "D" mark but both domains are already in use.

Runner-up: **Chowk**. Rejected because a market square reads bigger and less
neighbourly, and because "chowk" is the name of a dozen restaurants.

### How the name is set

| Use | Form |
|---|---|
| Wordmark, app title, store listing | `Nukkad` |
| Running text | `Nukkad` |
| Descriptor, five words | `AI commerce for the corner shop` |
| Tagline | `The corner shop, now answering on WhatsApp.` |
| Client alias in MCP setup commands | `nukkad` |
| Mark | a corner and a dot: the shop's corner and the light that stays on |

The brand name stays in Latin script in all seven locale bundles. Indian apps keep
their wordmark untranslated inside Hindi, Urdu or Tamil sentences, and a Latin
wordmark is the one string every reader can recognise. Script lockups (नुक्कड़ /
ਨੁੱਕੜ / نکڑ) are for advertising only, and a native speaker signs them off before
anything is printed.

### What still says "dukaan" on purpose

Renaming these loses data that is already on shopkeepers' phones, so they stay:

- `dukan-` and `dukaan-` localStorage keys, and `APP_KEY_PREFIXES` in `src/utils/localStore.ts`
- `#dukaan-tour-*` CSS hooks and `.dukaan-tour-popover` in `src/styles/walkthrough.css`
- `DUKAN_ORDERS_FILE` and `DUKAN_DEFAULT_OWNER_ID` environment variables
- `dukanBot.js`, `dukanCatalog.js`, `dukanOrders.js`, `dukanShops.js` file names
- the GitHub repository slug and the Supabase project

Moving those is a migration, not a rename. It is on the follow-up list, not in this
change.

---

## 2. The type

### What was wrong

`index.html` asked Google for `Manrope 400,500,700,800` and `Noto Sans 400,500,700,900`.

| Defect | Evidence |
|---|---|
| Weight 600 was never loaded | `grep -c 'font-semibold' src/**/*.tsx` = 95 uses. The browser synthesised every one of them by smearing the 500 outline. |
| Five of seven languages had no brand font | Manrope covers Latin, Cyrillic and Greek. Google's "Noto Sans" is the Latin subset. Devanagari, Gurmukhi, Gujarati, Tamil, Kannada and Arabic had no family to fall back to, so they rendered in whatever the phone shipped. |
| Two families, no roles | The body was Manrope, but Tailwind's `font-sans` was `["Noto Sans"]`. Any element with `font-sans` silently changed family. |
| Prices drifted | No tabular figures anywhere. Money in a list is not a column if the digits are proportional. |
| Body copy was 12px | `text-xs` appears 90 times, at weight 400, on black. |
| Urdu was left-to-right | Nothing set `dir`. The words were translated, the layout was not. |

### The decision

Two families, each with one job:

| Role | Family | Why |
|---|---|---|
| Latin UI, wordmark, every number | **Manrope** | Already the app's voice, variable 200 to 800, open licence, and the tight, slightly technical feel the dark UI is built around |
| Devanagari, Gurmukhi, Gujarati, Tamil, Kannada | **Noto Sans + script** | One family per script, same skeleton, so a Hindi row and a Latin row sit on the same optical weight |
| Urdu | **Noto Naskh Arabic** | Nastaliq is the right face for poetry and signage. At 13px in a table row its sloping baseline needs roughly double the leading, which would make the Urdu screen twice as tall as the Hindi one. Naskh keeps row heights equal. |

One request, `unicode-range` per subset, so the browser downloads only the scripts a
page actually paints. Weights 400 to 800, so 600 is a real cut of the font.

### The scale

Six roles. Hierarchy comes from size, weight and colour on one family, not from a
second display face: on a 390px dark screen a third family buys nothing and costs
another download.

| Role | Classes | Use |
|---|---|---|
| Display | `font-manrope font-extrabold text-4xl tracking-tight` | Wordmark, once per screen |
| Screen title | `font-manrope font-bold text-2xl tracking-tight` | The name of the screen |
| Section label | `font-sans font-bold text-sm uppercase tracking-wider` | Groups a block, accent colour |
| Body | `font-sans text-base leading-relaxed` | Sentences. 16px is the floor |
| Meta | `font-sans text-sm font-medium` | Timestamps, stock counts. 13px is the floor |
| Number | `font-manrope font-bold tabular-nums` | Prices, totals, quantities |

Rules that follow from the above:

- Indic scripts get `line-height: 1.7` through `:lang(hi)`, `:lang(gu)`, `:lang(pa)`,
  `:lang(ta)`, `:lang(kn)`, `:lang(ur)`. Marks above and below the headline stroke
  collide at Latin leading.
- Money uses `.tabular` (`font-variant-numeric: tabular-nums`), because a bill that
  does not line up is a bill the shopkeeper re-reads.
- No text below 13px, and no text at the muted tone below 4.5:1. The 11px labels on
  the consent sheet are the last exception and should go.

---

## 3. The colour

Measured with the WCAG relative-luminance formula. AA for body text is 4.5:1.

| Foreground | On black | On `#1A1A1A` | On `#2D2D2D` |
|---|---|---|---|
| `#FFFFFF` text primary | 21.00 | 17.40 | 13.77 |
| `#A3A3A3` text secondary | 8.33 | 6.90 | 5.46 |
| `#969696` muted floor | 7.10 | 5.88 | 4.66 |
| ~~`#737373` the old neutral~~ | ~~4.43~~ | ~~3.67~~ | ~~2.90~~ |
| `#E6E6FA` accent | 17.06 | 14.14 | 11.19 |

- `#737373` was the brand's grey. It failed AA on black and failed the 3:1 large-text
  floor on the raised surface. `#969696` replaces it, and the 39 `text-neutral-500`
  call sites moved to `text-neutral-400`.
- `#E6E6FA` on white is 1.23:1, which is why the light public pages (`/connect`,
  `/oauth/consent`) use `#3A3E98` at 9.04:1 on white. That second accent is now a
  named token, `accentInk`, instead of a literal repeated in five files.
- One accent, two tones, two surfaces. A third accent (`#FFC857` was on the online
  store card) is not in the system.

---

## 4. UI/UX changes in this change set

| Change | Why |
|---|---|
| Wordmark and tagline on the sign-in screen | The screen printed a second spelling of the name and a hardcoded Devanagari sentence, so an English reader and a Tamil reader both got Hindi |
| `@babel/standalone` removed | 2,345,070 bytes, 549,113 gzipped, requested in `<head>` where it blocks parsing. Vite compiles the TSX; nothing on the page ran Babel |
| Unused import map removed | Vite rewrote every bare specifier at build time, so the map only cost bytes |
| `viewport-fit=cover` | `BottomNav` pads itself with `env(safe-area-inset-bottom)`, which is 0 without this, so the bar sat under the iOS home indicator |
| Fonts: one request, seven scripts, real 600 | See section 2 |
| `dir` and `lang` on `<html>` | Urdu was rendering left to right |
| Contrast pass | See section 3 |
| The fake storefront claim removed | The online store screen told a shopkeeper "Your store is live at: sunil-kirana.dukaan.ai" after a button press, on a subdomain that does not exist |
| The faux product card on sign-in removed | It was 14 nested `div`s standing in for a screenshot, and it carried no information |
| MCP setup screen prints the endpoint that exists | It fell back to a host with no DNS record |

## 5. Follow-ups this change does not do

- **Compile Tailwind.** The app loads `cdn.tailwindcss.com`, which compiles CSS in the
  browser on every load and adds a console warning. A build-time Tailwind step would
  remove roughly 100 KB of JavaScript and the flash of unstyled text.
- **Regenerate the PNG icon set.** `public/brand/*.svg` is the vector mark.
  `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
  `og-image.png` and `public/logo.png` still show the old "D".
- **Replace the remaining colour literals.** `bg-[#1A1A1A]` appears 53 times and
  `bg-[#2D2D2D]` 52 times. The tokens exist; the call sites have not moved.
- **Move the domain.** Publish the app on a domain the project owns, then set
  `MCP_PUBLIC_URL`, the Supabase Site URL and Vercel's `VITE_MCP_URL` to it.
- **Rename the repository and the Supabase project**, then update `README.md`,
  `.claude/context.md` and the deploy notes.
- **Rename the storage keys** in a migration that copies `dukaan-*` to the new prefix
  and reads both for one release.
