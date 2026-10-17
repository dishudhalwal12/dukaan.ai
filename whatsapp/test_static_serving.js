import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { installPosRoutes } from './posStatic.js';

console.log('--- RUNNING POS STATIC SERVING TESTS ---');

// A throwaway stand-in for the Vite build, so this stays hermetic: it never
// reads the developer's real dist/ or touches whatsapp/.env.
const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-dist-'));
fs.mkdirSync(path.join(distDir, 'assets'));
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>POS-INDEX</title>');
fs.writeFileSync(path.join(distDir, 'assets', 'app-abc123.js'), 'console.log(1)');

const app = express();
// The routes server.js registers BEFORE the POS mount.
app.get('/api/status', (req, res) => res.json({ status: 'qr_ready' }));
app.post('/api/echo', (req, res) => res.json({ ok: true }));
app.get('/events', (req, res) => res.type('text/event-stream').send(': ping\n\n'));
// Registered last, exactly as server.js does it.
installPosRoutes(app, distDir);

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  // ── Test 1: the POS is served from the root ────────────────────────────────
  console.log('\nTest 1: the built POS is served at /');
  let res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /POS-INDEX/);
  assert.strictEqual(res.headers.get('cache-control'), 'no-cache', 'index.html must not be cached');

  // ── Test 2: hashed assets are immutable, index is not ──────────────────────
  console.log('\nTest 2: content-hashed assets get a long immutable cache');
  res = await fetch(`${base}/assets/app-abc123.js`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(
    res.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
    'a hashed asset may be cached for a year'
  );

  // ── Test 3: client-side routes fall back to index.html ─────────────────────
  console.log('\nTest 3: a deep client-side route falls back to index.html');
  res = await fetch(`${base}/orders/DKN-1001`);
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /POS-INDEX/, 'the SPA fallback serves the app shell');

  // ── Test 4: the API is not shadowed by the fallback ────────────────────────
  console.log('\nTest 4: /api routes are not shadowed');
  res = await fetch(`${base}/api/status`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'qr_ready' });

  // ── Test 5: SSE is not shadowed ────────────────────────────────────────────
  console.log('\nTest 5: the SSE stream is not shadowed');
  res = await fetch(`${base}/events`);
  assert.match(
    res.headers.get('content-type'),
    /^text\/event-stream/,
    'the SSE stream must still be reachable'
  );

  // ── Test 6: a mistyped API path stays a 404, not the app shell ─────────────
  console.log('\nTest 6: an unknown API path is a 404, never HTML');
  res = await fetch(`${base}/api/nope`);
  assert.strictEqual(res.status, 404, 'a mistyped API call must not return the app shell');

  // ── Test 7: non-GET requests are never swallowed ───────────────────────────
  console.log('\nTest 7: POST is never answered by the fallback');
  res = await fetch(`${base}/api/echo`, { method: 'POST' });
  assert.deepStrictEqual(await res.json(), { ok: true });

  // ── Test 8: a JSON client gets a 404, not the app shell ────────────────────
  console.log('\nTest 8: a non-HTML client is not handed the app shell');
  res = await fetch(`${base}/orders`, { headers: { accept: 'application/json' } });
  assert.strictEqual(res.status, 404, 'an API client must not receive HTML for an unknown path');

  console.log('\n========================================');
  console.log('🎉 ALL POS STATIC SERVING TESTS PASSED 🎉');
  console.log('========================================');
} finally {
  server.close();
  fs.rmSync(distDir, { recursive: true, force: true });
}
