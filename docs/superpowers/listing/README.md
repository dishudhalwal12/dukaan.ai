# Public listing package

Everything OpenAI asks for on the plugin submission page, kept next to the code so a
rebuild is one command and nothing is retyped from memory.

```
listing/
├── .codex-plugin/plugin.json   identity, interface, review test cases, publication
├── .mcp.json                   the remote MCP server URL
└── assets/                     composer icons and logos, light and dark
                                (both are public/logo.png: the light pair as is,
                                 the dark pair inverted, same mark throughout)
```

Build the upload file from this folder:

```bash
cd docs/superpowers/listing
zip -qr ../../../plugin.zip .codex-plugin .mcp.json assets
```

## What is in the manifest, and why

| Field | Value | Note |
|---|---|---|
| `name` | `dukaan` | Identity of the **new public plugin**. The first plugin (app-backed, id `dev-6adfe…`) can only ever accept its own `.app.json`, so it cannot become public. |
| `version` | `1.0.0` | First release of the public plugin. Increase on every later upload. |
| `interface.displayName` | Dukaan | What users see. |
| `interface.shortDescription` | Groceries from shops near you. | 37 characters. |
| `interface.defaultPrompt` | 3 prompts | Maximum three, 128 characters each. These are the "Skills" chips on the listing; screenshots are no longer shown. |
| `interface.composerIcon` / `logo` | `./assets/...` | This is the icon on the Plugins list. Without these files the list showed a generic mark. |
| `interface.category` | chosen in the dashboard | Not in the package until the exact dropdown label is known. "Shopping" was rejected. |
| `interface.websiteURL` | https://dukaan-ai-info.vercel.app | The marketing page, answered 200 on 2026-10-27. |
| `interface.supportURL` / `privacyPolicyURL` / `termsOfServiceURL` | app pages | `/support`, `/privacy`, `/terms` on dukaan-ai-hypnexis.vercel.app. |
| `extensions.com.openai.review.test_cases` | 5 positive, 3 negative | The scenarios a reviewer runs. Keep them true when behaviour changes. |
| `extensions.com.openai.commerce` | `true` | Physical goods, cash on delivery, no payment processing. |

## Why this is a new plugin, not an update

Uploading this package to the old plugin fails with
`Plugin upload must contain exactly the existing canonical app`, because that plugin was created from
an app reference (`asapp_…` / `.app.json`). A package that contains `.app.json` is not submittable
for public review. The two rules leave one path: submit a new plugin from this package. The old one
stays as a personal plugin, which is fine for testing.

If you want the existing listing's history instead, OpenAI support is the only route: changing an
existing plugin's MCP URL is not supported in the update flow.

## Metadata findings that were already fixed

| Finding | Fix |
|---|---|
| Privacy policy website is not accessible | `/privacy`, `/terms`, and `/support` are now emitted as static HTML (`scripts/build-static-pages.mjs`, rewrites in `vercel.json`). A checker that does not run JavaScript reads the full policy. |
| Add no more than three prompts | `defaultPrompt` holds three. |
| Select a valid category | The value was removed from the package; pick it from the dashboard dropdown. |
| Incomplete review information | The demo video is required for MCP review. Record 60 seconds using the shot list below, then paste the URL into Review details (or give it to the agent to embed as `demo_recording_url`). Reviewer credentials go in the secure form, never in the ZIP. |

## Demo video shot list (60 seconds)

1. Sign in with the reviewer account, approve the connector.
2. Type "Order 2 packs of soap from the nearest shop".
3. Show the shop, the two soap options and prices.
4. Show the confirmation block: name, phone, address, items, total, cash on delivery.
5. Tap yes, show the order id and "waiting for the shop to accept".
6. Cut to the shopkeeper's dashboard with the same order.

## What the package cannot do

It cannot set Category, Website, Privacy, Terms, Support, or the example prompts if the
portal form overrides them, and it cannot change the MCP URL of an existing plugin
(OpenAI support handles that). Those are dashboard edits.

## Reviewer credentials

```
email     reviewer@dukaan-ai.com
password  DukaanReview2026!
```

Seeded by `scripts/qa/seed_review_account.mjs`: one shop with 13 products at 26.9092,
75.1846, radius 10 km, plus a saved address at pincode 303604 and a saved position, so
the review flow works from any country without granting location.

## Reaching the MCP server from the portal

`.mcp.json` declares `https://dukaan-ai-hypnexis.vercel.app/mcp`. In the plugin page,
open **MCPs**, connect that server, and run the scan. Tool findings appear per tool;
annotation and description issues are the ones this repo's `npm run mcp:test` prevents.
