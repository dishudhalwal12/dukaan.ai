import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The public health check must not describe the shop.
 *
 * `/api/status` needs no token — the watchdog, ngrok and the deploy script use
 * it — so anything in its body is readable by anyone who can reach the tunnel.
 * It used to return `user.id`, and a WhatsApp id is a JID: that published the
 * shopkeeper's own phone number. The linked number now travels on the
 * authenticated SSE payload instead.
 *
 * Checked at the source, which is where the regression would be introduced. The
 * live guarantee is asserted against the running bot by
 * `deploy/laptop/update.sh`, which reads the real response body.
 */

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, 'server.js'), 'utf8');

console.log('--- RUNNING STATUS REDACTION TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ── 1. the public route's body ───────────────────────────────────────────────
const handler = /app\.get\('\/api\/status',[^)]*\)\s*=>\s*\{(?<body>[\s\S]*?)\n\}\);/.exec(server);
assert.ok(handler, 'could not locate the /api/status handler');
const body = handler.groups.body;

assert.ok(
  !/\buser\b/.test(body),
  'the public /api/status body must not carry account data (id is a JID holding the phone number)'
);
assert.ok(!/phone/i.test(body), 'the public /api/status body must not carry a phone number');
assert.ok(!/\bid\b/.test(body), 'the public /api/status body must not carry an id');
assert.ok(/status: connectionStatus/.test(body), 'it must still report the connection status');
assert.ok(/timestamp:/.test(body), 'it must still report a timestamp');
ok('the public health check reports the connection and nothing about the shop');

// ── 2. the authenticated stream still feeds the settings screen ──────────────
{
  // Every payload that carries a `user`, wherever it is sent from.
  const userExprs = [...server.matchAll(/user: (\{[^\n]*\}|userInfo \? \{[^\n]*\} : null|null),?/g)].map((m) => m[1]);

  assert.ok(
    userExprs.length >= 2,
    `expected the SSE init and status payloads to carry a user, found ${userExprs.length}: ${JSON.stringify(userExprs)}`
  );

  for (const expr of userExprs) {
    assert.ok(
      !/userInfo\.id/.test(expr),
      `a payload must not publish the JID — send \`phone\` instead: ${expr}`
    );
  }

  assert.ok(
    userExprs.some((expr) => /phone: userInfo\.phone/.test(expr)),
    'the authenticated payloads must carry the linked phone, which is what the settings screen renders'
  );
  ok('the authenticated stream carries the linked number for the settings screen, and no JID');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} STATUS REDACTION TESTS PASSED 🎉`);
console.log('========================================');
