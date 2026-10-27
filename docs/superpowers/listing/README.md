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
| `name` | `dev-6adfe312761c81919383382a29b9f027` | Identity of the existing plugin. An update is rejected when this changes. |
| `version` | `1.0.3` | Must increase on every upload. |
| `interface.displayName` | Dukaan | What users see. |
| `interface.shortDescription` | Groceries from shops near you. | 37 characters. |
| `interface.defaultPrompt` | 5 prompts | These are the "Skills" chips on the listing page; screenshots are no longer shown. |
| `interface.composerIcon` / `logo` | `./assets/...` | This is the icon on the Plugins list. Without these files the list showed a generic mark. |
| `interface.websiteURL` | https://dukaan-ai-info.vercel.app | The marketing page, answered 200 on 2026-10-27. |
| `interface.supportURL` / `privacyPolicyURL` / `termsOfServiceURL` | app pages | `/support`, `/privacy`, `/terms` on dukaan-ai-hypnexis.vercel.app. |
| `extensions.com.openai.review.test_cases` | 5 positive, 3 negative | The scenarios a reviewer runs. Keep them true when behaviour changes. |
| `extensions.com.openai.commerce` | `true` | Physical goods, cash on delivery, no payment processing. |

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
