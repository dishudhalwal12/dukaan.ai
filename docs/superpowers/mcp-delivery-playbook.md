# Dukaan MCP — client setup + delivery playbook

**Status:** live and verified. `GET /health` → `{"supabaseKey":"ok"}`,
`/.well-known/oauth-protected-resource` → 200, unauthenticated `/mcp` → 401 with a discovery challenge.
**Last verified:** 2026-10-26, branch `feat/mcp-address-truth` (`1e2f333`).

This file has two halves:

1. **For you (the operator):** exact settings and the one prompt to paste into ChatGPT, a phone
   browser, Antigravity, or any other MCP client.
2. **For the agent (me, next time):** the working method, the measured acceptance numbers, and the
   trap list, so the same quality is reproducible instead of accidental.

---

# Part 1 — Connect a client

## The one thing every client needs

| Setting | Value |
|---|---|
| Transport | **HTTP** (streamable HTTP, not SSE) |
| MCP server URL | `https://dukaan-ai-hypnexis.vercel.app/mcp` |
| Authentication | **OAuth** (dynamic client registration; no API key, no client secret to paste) |
| Scopes | `openid email profile` (granted by the consent page) |

OAuth happens in the browser: the client opens
`https://dukaan-ai-hypnexis.vercel.app/oauth/consent?authorization_id=…`, where the customer

1. signs in (Google or email),
2. optionally taps **Allow location** (this is what lets the assistant find shops without asking
   for a pincode),
3. taps **Approve**.

No secret is ever pasted into a client. Each client registers itself and can be revoked separately
from Supabase → Authentication → connected apps.

## Prompt to paste (works in every client)

```
Use the Dukaan connector to buy me 2 packs of soap.
Use my saved location to find the nearest shop that has it.
Show me the shop, the items, the total, and the full delivery address,
then wait for my yes before placing the order.
```

Shorter, once you trust it:

```
use dukaan mcp and buy me a soap 2 pack thank you
```

The first prompt is deliberately explicit about *show → confirm → place*; it is the same contract the
server enforces (`quote_order` → `place_order` with `confirmed: true`).

## ChatGPT (web)

1. Settings → **Connectors** (some plans label it "Apps & Connectors").
2. **Advanced** → turn on **Developer mode**. (If you cannot find it, the account plan does not
   expose custom connectors yet — use the ChatGPT web app on a paid plan, or any other client below.)
3. **Create** a connector:
   - Name: `Dukaan`
   - MCP server URL: `https://dukaan-ai-hypnexis.vercel.app/mcp`
   - Authentication: **OAuth** — leave client ID/secret empty if it offers dynamic registration.
4. Save, then start a **new chat** and enable the connector from the tools/“+” menu.
5. Paste the prompt. The browser opens the Dukaan consent page → sign in → Allow location →
   Approve → back in the chat, the assistant answers and asks for your confirmation.

## ChatGPT on a phone

- **Configure once on the web** (above). The connector belongs to your OpenAI account, so it appears
  in the mobile app on the same account.
- If the mobile app hides the developer/connector UI, that is expected: create it on web, then use it
  on the phone.
- **Mobile browser** (`chatgpt.com` in Safari/Chrome) uses the same account and the same connector; it
  is the simplest path when the app UI lags behind. The OAuth consent page is built for phones —
  black card, full-width buttons, works at 360 px.

## Google Antigravity

1. Open Antigravity → **MCP** panel (Settings / Agent settings — exact label varies by build).
2. **Add server** → choose **HTTP** / **remote** (not stdio, not SSE).
3. Name `dukaan`, URL `https://dukaan-ai-hypnexis.vercel.app/mcp`.
4. Save, then run the prompt. The first tool call triggers the browser consent page; approve once.

If the panel asks for a JSON entry instead of a form, the two shapes currently in use are:

```json
{ "mcpServers": { "dukaan": { "httpUrl": "https://dukaan-ai-hypnexis.vercel.app/mcp" } } }
```

```json
{ "mcpServers": { "dukaan": { "serverUrl": "https://dukaan-ai-hypnexis.vercel.app/mcp" } } }
```

Use whichever key the panel validates (Antigravity is built on the Gemini agent stack, which takes
`httpUrl`; some builds accept `serverUrl`). If it only supports local commands, bridge it:

```bash
npx mcp-remote https://dukaan-ai-hypnexis.vercel.app/mcp
```

`mcp-remote` handles the OAuth flow on behalf of stdio-only clients — use it as the *command* of the
server entry, with the URL as its argument.

## Other clients (already documented on /connect)

| Client | Where | What to paste |
|---|---|---|
| Claude | Settings → Connectors → Add custom connector | the URL |
| Claude Code | terminal | `claude mcp add --transport http dukaan https://dukaan-ai-hypnexis.vercel.app/mcp` |
| OpenCode | terminal | `opencode mcp add dukaan --url https://dukaan-ai-hypnexis.vercel.app/mcp --global` then `opencode mcp auth dukaan` |
| Cursor | `~/.cursor/mcp.json` | `{"mcpServers":{"dukaan":{"url":"…"}}}` |
| VS Code | `.vscode/mcp.json` | `{"servers":{"dukaan":{"type":"http","url":"…"}}}` |
| Anything stdio-only | terminal | `npx mcp-remote https://dukaan-ai-hypnexis.vercel.app/mcp` |

Note: `/connect` in the app does **not** list Antigravity yet — that is a one-tab change if you want
it (see “Next steps” at the bottom).

## What the assistant can do once connected (15 tools)

| Group | Tools |
|---|---|
| Discovery | `find_products_nearby` (nearest shops that **stock** the item — preferred), `find_shops`, `search_products`, `get_shop` |
| Address | `save_address`, `list_addresses`, `delete_address`, `save_customer_profile`, `get_customer_profile`, `remember_location` |
| Ordering | `quote_order` (price lock, 10 min), `place_order` (needs explicit confirmation), `show_checkout` (MCP Apps card) |
| After the order | `get_order`, `list_orders`, `cancel_order` |

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| `401` with `resource_metadata` | correct — the client has not authenticated yet | complete the browser consent |
| `503 server_misconfigured` naming `SUPABASE_ANON_KEY` | server-side env problem, never a customer problem | update the Vercel env var; check `/health` → `supabaseKey` |
| Assistant asks for a pincode although you allowed location | consent was approved without sharing location, or the fix is older than 30 days (`location_stale`) | re-approve with **Allow location**, or send a map pin in chat |
| `no_matching_shops` | nothing nearby stocks that item | ask for a different item/shop, or widen the shop's delivery radius (merchant setting) |
| `out_of_range` with a distance | the nearest shop is outside its own delivery radius | choose a shop that serves you, or the merchant raises the radius |
| `address_not_found` / `location_required` | no pin and no geocodable text | share a map pin in chat |
| `unsupported` on discovery | server deployed without the nearby-search functions | redeploy after the migrations below |

**Health check to run before any demo:**

```bash
curl -s https://dukaan-ai-hypnexis.vercel.app/health
# want: "supabaseKey":"ok"
```

## Deploy checklist (order matters)

Merge `feat/mcp-address-truth` → Vercel deploys → then run these in Supabase → SQL Editor:

1. `supabase/migrations/2026-10-29_address_source.sql`
2. `supabase/migrations/2026-10-30_quote_request_hash.sql`
3. `supabase/migrations/2026-10-31_order_customer_mapsurl.sql`
4. `supabase/migrations/2026-11-01_mcp_nearby_search.sql`

Then redeploy (env/migration changes only take effect on a new deployment) and re-check `/health`.

---

# Part 2 — How this was built (reuse this method)

The quality you liked came from a method, not from luck. Ask for it explicitly.

## The five rules

1. **No result without a command.** Every claim in a report is backed by output I ran in that session:
   a test, a curl, a measured number. “Should work” is not a status.
2. **RED before GREEN.** Every behaviour starts as a failing test I watch fail (missing module,
   `address_not_found`, `match_type: 'house'`, duplicate quote…), then the smallest change that makes it
   pass. A test that passed before the code existed is reported as a finding about the test.
3. **Measured, never extrapolated.** Latency, correct-shop rate, and stock behaviour come from the load
   harness. When a measurement cannot represent production (PGlite in-process), the report says so.
4. **One independent review, then one fix pass.** A fresh reviewer reads the whole diff against the
   plan; Critical/Important findings get a RED→GREEN fix each; Minor findings are listed, not fixed
   silently.
5. **Rulings are spoken.** Every decision taken on your behalf (a trade-off, a deferred minor, a
   deviation) is reported with what it costs if wrong. Nothing is decided in secret.

## The workflow that produced Phase A–D

1. **Extract the spec from you in your words**, then restate it, then plan. (Your decision on
   2026-10-26: no paid geocoding; the app location is the delivery point; the POS popup field set is
   the contract; the chat asks name, phone, address.)
2. **Write a plan file** at `docs/superpowers/plans/<date>-<slug>.md`: per task — goal, files, steps
   with an `Expected:` line, acceptance, commit. Add a **Review focus** section naming the input
   classes the tests will not cover.
3. **Work in an isolated worktree** on its own branch, `node_modules` symlinked.
4. **Keep a ledger** (`.superpowers/sdd/<plan>/progress.md`): one line per task with the commit range
   and the exact test command + result. It survives context loss.
5. **One commit per task**, message stating the *why* (what was broken, what the user saw).
6. **Review package + fresh reviewer** (`deepseek-v4-pro` worked here; Opus/GPT models were not
   connected). Feed it the diff, the plan, and the ledger so it can weigh the rulings.
7. **Fix pass** (one only) and a **measured QA run** (`npm run qa`).
8. **Report**: what shipped, the proof table, what the review found, rulings with cost, deferred
   minors, and exactly what you must do next.

## Artifacts from this delivery

| File | What it holds |
|---|---|
| `docs/superpowers/plans/2026-10-26-mcp-address-truth.md` | Phase A+B plan (10 tasks) |
| `docs/superpowers/plans/2026-10-26-mcp-scale-catalog.md` | Phase C+D plan (10 tasks) |
| `supabase/migrations/2026-10-29…11-01_*.sql` | four migrations |
| `scripts/qa/personas.mjs` | P1–P10, 10/10 |
| `scripts/qa/load_nearby.mjs` | 10 000 shops / 200 000 products, 100 % correct, p95 ≈ 1 ms (PGlite) |

## Acceptance numbers to reproduce

```bash
npm run qa              # 29 MCP suites + personas + load
npm test                # app regression suite
npx tsc --noEmit
npm run build           # includes the secret guard
curl -s https://dukaan-ai-hypnexis.vercel.app/health   # "supabaseKey":"ok"
```

Expected: personas **10 pass, 0 fail**; load **100.0 % correct shop**, a shop beyond row 9 000 found;
29 suites green.

## Trap list — check these first next time

| Trap | What it looked like | Where the fix lives |
|---|---|---|
| Rotated anon key | every customer tool `profile_unavailable: Invalid API key`, discovery still green | `mcp/keys.js` probes the project and picks a key it accepts; `/health` reports `supabaseKey` |
| Address geocoding as a hard dependency | `address_not_found` for a valid Indian address | `save_address` coordinate ladder: shared pin → app location → geocoder → honest `location_required` |
| Client-asserted precision | a GPS pin stored as a verified `house` | precision computed from evidence; `geocode_verified` is the only path to house-level |
| Stale keep-alive socket | `ECONNRESET` on the first write after an idle gap, retry works | `mcp/net.js` retries once, only for socket errors |
| Non-idempotent retry | two quotes for one basket | unique partial index on `(user_id, request_hash)`; the loser returns the winner |
| Registry download at scale | right shop invisible above the REST row cap | `mcp_find_shops` / `mcp_search_nearby_products` in SQL with bbox + LIMIT |
| Token OR matching | “toothpaste” matching tomato paste | aliases are shelf words only; typo tolerance stays per-shop |
| Radius filter on the probe | “nearest shop is X km” could never fire | `p_ignore_radius` for the out-of-range probe |
| Broken stream | customer saw `ECONNRESET` with no JSON error | `nodeAdapter` answers 500 `stream_error` when headers are unsent |

## Brief template for the next round

> Use the playbook in `docs/superpowers/mcp-delivery-playbook.md`.
> Goal: `<one sentence>`.
> Decisions already made: `<bullets>`.
> Do not: `<bullets>`.
> Plan first in `docs/superpowers/plans/`, TDD per task, one commit each, ledger, one fresh review,
> one fix pass, measured QA. Push the branch when green; I merge.

## Next steps worth doing

- Add an **Antigravity** tab (and a "ChatGPT on mobile" note) to `/connect`, so customers do not need
  this file.
- Re-measure the load harness against the real Supabase project (PGlite is a floor, not a p95 promise).
- Phase E candidates: bbox antimeridian wrap, per-shop variant crowding in `find_products_nearby`,
  enforcing `pack_size` in `quote_order`.
