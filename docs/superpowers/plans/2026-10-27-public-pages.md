# Public pages for the OpenAI listing (Phase E)

**Branch:** `feat/mcp-address-truth` (continues, still unmerged; one PR, one review).
**Why:** the app listing needs a public privacy policy, terms, and a support contact, plus a
developer-facing page that names ChatGPT, Claude and Antigravity. None of those exist today;
`PrivacyPolicyScreen` is only reachable inside the app shell, and `/connect` has no Antigravity tab.
**Spec:** user decision 2026-10-26/27: cash on delivery, app location is the delivery point, no paid
APIs, plain writing with no em dashes, and the pages must be reachable without signing in.

## Constraints
- Same visual language as the consent and connect pages (black canvas, #1A1A1A cards, #E6E6FA accent).
- No invented facts: no retention periods, no email address, no SLA, no legal entity name.
- Every contact shown must be configured, never a dead link.
- `npm run mcp:test`, `npm test`, `tsc`, `build` green after every task.

## Task 1: Route plumbing and the privacy page
**Steps** 1. RED: `scripts/test_public_pages.js` asserts `/privacy`, `/terms`, `/support` are rewritten
in `vercel.json`, mounted in `src/index.tsx`, and that the privacy text names account, address,
location, orders, and deletion. Run → FAIL. 2. GREEN: add the routes and the page. 3. Commit.

## Task 2: Terms
Terms must state cash on delivery, shop may reject, cancel before acceptance, prices locked at quote
time, and that Dukaan is not the shop. RED first in the same test file.

## Task 3: Support
Contact comes from `VITE_SUPPORT_EMAIL` and `VITE_SUPPORT_WHATSAPP`; when neither is set the page
shows in-app instructions instead of an empty link. Tests cover both branches.

## Task 4: `/connect` for developers
Add Antigravity, a ChatGPT-on-mobile note, and a heading that names the job. Set page title and meta
description per public route so the page is indexable with the right words.

## Task 5: Gates and docs
Extend the Vercel route test, run every gate, update `docs/mcp-verification.md` and the playbook,
one fresh review, one fix pass.
