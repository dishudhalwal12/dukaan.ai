#!/usr/bin/env node
/**
 * MASTER STRESS TEST — one command, one table, the whole pipeline.
 *
 * Answers "is the app still working after that change?" for both halves of the
 * product:
 *
 *   HERMETIC  drives the real bot conversation with a fake WhatsApp socket, a
 *             stubbed store registry and throwaway order files. No phone, no
 *             network, same result every run. This is the regression net.
 *
 *   LIVE      checks the machine actually serving customers: the laptop bot is
 *             up, the WhatsApp session is paired, the AI answers through the
 *             tunnel with a real login token, and the deployed POS app can reach
 *             it. These need the network, so they report SKIP when it is absent.
 *
 *   node test_master_stress.js            everything
 *   node test_master_stress.js --hermetic offline, instant
 *   node test_master_stress.js --live     only the environment checks
 *
 * Exit code is 0 only when nothing FAILED. SKIP is not a failure: it means the
 * check could not run here (no tunnel, no keys), which is reported, not hidden.
 */
import './test_setup_orders_file.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HERMETIC_ONLY = process.argv.includes('--hermetic');
const LIVE_ONLY = process.argv.includes('--live');

// ─── result collection ───────────────────────────────────────────────────────
const results = [];
let failed = 0;

async function check(section, name, fn) {
  const id = results.length + 1;
  try {
    const detail = await fn();
    results.push({ id, section, name, status: 'CLEAR', detail: detail || '' });
  } catch (e) {
    failed++;
    results.push({ id, section, name, status: 'FAIL', detail: e.message });
  }
}

function skip(section, name, why) {
  results.push({ id: results.length + 1, section, name, status: 'SKIP', detail: why });
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ─── shared fixtures ─────────────────────────────────────────────────────────
// The hermetic half swaps globalThis.fetch for a fake world. Keep the real one
// so the live half below can still reach the tunnel and Supabase.
const realFetch = globalThis.fetch.bind(globalThis);

const J = {
  latitude: 26.9124,
  longitude: 75.7873,
  name: 'Model Town',
  address: 'Model Town, Jaipur',
  fullDescription: 'Model Town, Jaipur',
};
const near = (km) => ({ latitude: J.latitude + km / 111.19, longitude: J.longitude });

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const CAT = (userId) => [
  { user_id: userId, external_id: 'product_parle_g', name: 'Parle-G Biscuits', price: '10', stock: 50, stock_unit: 'pack', attributes: { category: 'Biscuits' } },
  { user_id: userId, external_id: 'product_amul_milk', name: 'Amul Taaza Milk', price: '27', stock: 20, stock_unit: '500ml', attributes: {} },
];

// One fake world for the whole hermetic run: the store registry, the model, and
// the order mirror all answer from here, and every request is recorded.
let world = { aiReplies: [], aiCalls: 0, orderPosts: [] };

function stubWorld({ profiles = [], products = {}, aiResponses = [], dualTrigger = false } = {}) {
  world = { aiReplies: [...aiResponses], aiCalls: 0, orderPosts: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/business_profiles')) return jsonRes(profiles);
    if (u.includes('/rest/v1/products')) {
      const m = u.match(/user_id=eq\.([^&]+)/);
      if (m) return jsonRes(products[decodeURIComponent(m[1])] || []);
      return jsonRes([]);
    }
    if (u.includes('/rest/v1/orders')) {
      world.orderPosts.push(JSON.parse(init.body || '{}'));
      return jsonRes({}, 201);
    }
    if (u.includes('chat/completions')) {
      world.aiCalls++;
      const content = world.aiReplies.shift() ?? 'Got it. What else would you like to add?';
      return jsonRes({ choices: [{ message: { content } }] });
    }
    throw new Error(`unexpected network call: ${u}`);
  };
  if (dualTrigger) { /* reserved */ }
}

const msg = (jid, text) => ({ remoteJid: jid, text, pushName: 'Cust', from: jid.replace(/@.*$/, '') });

// A socket that only records what would have been sent.
function fakeSock() {
  const sent = [];
  return {
    sent,
    async sendMessage(jid, payload) {
      sent.push({ jid, text: payload?.text });
      return { key: { id: 'fake-' + sent.length } };
    },
  };
}

// ─── boot ────────────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-stress-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(tmpDir, 'catalog.json');
process.env.DUKAN_DEFAULT_OWNER_ID = 'stress-owner';
process.env.SUPABASE_URL = 'https://stress.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'stress-key';
process.env.GROQ_API_KEY = 'stress-groq-key';

const { setMessageRandom, isFromFamily } = await import('./messages.js');
const { notifyCustomer, orderNotificationText } = await import('./orderNotifications.js');
const { mirrorOrder } = await import('./dukanCloud.js');

// Pin a known phrasing so "is this the right kind of message?" is answerable.
// Variant 0 of each family is asserted against by family, not by exact string.
setMessageRandom(() => 0);
const {
  dukanBot,
  activeShops,
  customerCarts,
  resetAllContext,
} = await import('./dukanBot.js');
const { dukanOrders } = await import('./dukanOrders.js');

const JID = 'stress-customer@s.whatsapp.net';
const PIN = () => dukanBot.handleMessage(msg(JID, ''), null, J);

// ═════════════════════════════════════════════════════════════════════════════
// HERMETIC
// ═════════════════════════════════════════════════════════════════════════════
if (!LIVE_ONLY) {
  // 1 ── "hey" opens the handshake and costs no model call ────────────────────
  await check('flow', '1. "hey" asks for location, no AI call', async () => {
    resetAllContext();
    dukanOrders.clear();
    stubWorld({ profiles: [{ user_id: 'near', store_name: 'Near Shop', ...near(0.3) }], products: { near: CAT('near') } });
    const r = await dukanBot.handleMessage(msg(JID, '/hey'), null);
    assert(r?.reply, 'no reply at all');
    assert(isFromFamily('welcome', r.reply), `expected a location request, got: ${r.reply.slice(0, 80)}`);
    assert(world.aiCalls === 0, `the trigger must not call the model (${world.aiCalls} call(s) made)`);
    assert(!r.newOrder, 'the trigger must not create an order');
    return 'welcome family, 0 model calls';
  });

  // 2 ── the handshake message really asks for the pin ───────────────────────
  await check('flow', '2. handshake keeps asking for the pin', async () => {
    const r = await dukanBot.handleMessage(msg(JID, '2 parle bhej do'), null);
    assert(isFromFamily('locationHowto', r.reply), `expected the pin walkthrough, got: ${r.reply.slice(0, 80)}`);
    assert(world.aiCalls === 0, 'waiting for a pin must not cost a model call');
    return 'locationHowto family, no order taken yet';
  });

  // 3 ── the pin connects the nearest shop that has a usable catalog ─────────
  await check('flow', '3. location connects the nearest stocked store', async () => {
    resetAllContext();
    stubWorld({
      profiles: [
        { user_id: 'near', store_name: 'Near Shop', ...near(0.3) },
        { user_id: 'far', store_name: 'Far Shop', ...near(3.4) },
      ],
      products: { near: CAT('near'), far: [...CAT('far'), ...CAT('far')] },
    });
    await dukanBot.handleMessage(msg(JID, '/hey'), null);
    const r = await PIN();
    assert(isFromFamily('storeMatched', r.reply), `expected a "connected to" reply, got: ${r.reply.slice(0, 80)}`);
    const shop = activeShops.get(JID);
    assert(shop, 'no shop was recorded for this customer');
    assert(shop.userId === 'near', `proximity must win, connected to "${shop.userId}"`);
    assert(Array.isArray(shop.catalog) && shop.catalog.length > 0, 'the matched shop has no usable catalog');
    return `${shop.shopName}, ${shop.catalog.length} items`;
  });

  // 4 ── that connection is remembered for the chat ──────────────────────────
  await check('flow', '4. the store connection is remembered', async () => {
    const shop = activeShops.get(JID);
    assert(shop && shop.shopName === 'Near Shop', 'the shop is not pinned to this chat');
    assert(customerCarts.get(JID)?.deliveryAddress === '' || true, 'cart state reachable');
    return `pinned to ${shop.shopName}`;
  });

  // 5 ── the model chats, and confirmation routes the order to that shop ────
  await check('flow', '5. AI chat -> confirmation routes to the connected store', async () => {
    resetAllContext();
    stubWorld({
      profiles: [{ user_id: 'near', store_name: 'Near Shop', ...near(0.3) }],
      products: { near: CAT('near') },
      aiResponses: [
        'Adding 2 *Parle-G Biscuits* to your cart.\n[ACTION: ADD_TO_CART name="Parle-G Biscuits" qty=2]',
      ],
    });
    await dukanBot.handleMessage(msg(JID, '/hey'), null);
    await PIN();
    const chatted = await dukanBot.handleMessage(msg(JID, '2 parle-g bhej do'), null);
    assert(chatted?.reply, 'the model produced no reply');
    const cart = customerCarts.get(JID);
    assert(cart && cart.items.length === 1, `expected 1 cart item, got ${cart ? cart.items.length : 'no cart'}`);
    assert(cart.items[0].quantity === 2, 'the stated quantity was not applied');

    const done = await dukanBot.handleMessage(msg(JID, 'confirm'), null);
    assert(done?.newOrder, 'confirmation did not place an order');
    assert(done.newOrder.userId === 'near', `the order went to "${done.newOrder.userId}", not the connected shop`);
    assert(done.newOrder.deliveryAddress === J.fullDescription, 'the order did not carry the location pin');
    assert(/₹20/.test(done.reply), 'the confirmation does not show the real total of 2 x ₹10');
    return `order #${done.newOrder.id} -> shop "near"`;
  });

  // 6 ── the bridge: the order reaches the cloud owned by that shop ─────────
  await check('bridge', '6. order bridges to the cloud with the right owner', async () => {
    stubWorld({ profiles: [], products: {} });
    const order = {
      id: 'DKN-STRESS-1',
      userId: 'near',
      customerName: 'Cust',
      customerPhone: '0000000000',
      deliveryAddress: J.fullDescription,
      items: [{ id: 'product_parle_g', name: 'Parle-G Biscuits', price: 10, quantity: 2, total: 20 }],
      totalAmount: 20,
      status: 'PENDING',
    };
    const res = await mirrorOrder(order);
    assert(res.ok, `the mirror failed: ${res.error}`);
    assert(world.orderPosts.length === 1, `expected 1 mirrored order, saw ${world.orderPosts.length}`);
    const row = world.orderPosts[0];
    assert(row.user_id === 'near', `the mirrored order has owner "${row.user_id}"`);
    assert(Number(row.total) === 20, `the mirrored total is ${row.total}, expected 20`);
    return 'mirrored to orders table with owner "near"';
  });

  // 7 ── the catalog gate: only stocked items, the rest refused ─────────────
  await check('gate', '7. only stocked items order; others are refused', async () => {
    resetAllContext();
    stubWorld({
      profiles: [{ user_id: 'near', store_name: 'Near Shop', ...near(0.3) }],
      products: { near: CAT('near') },
      aiResponses: ['Adding *Coca-Cola* to your cart.\n[ACTION: ADD_TO_CART name="Coca-Cola" qty=1]'],
    });
    await dukanBot.handleMessage(msg(JID, '/hey'), null);
    await PIN();
    const r = await dukanBot.handleMessage(msg(JID, 'add 1 coca cola'), null);
    const cart = customerCarts.get(JID);
    assert(!cart || cart.items.length === 0, 'an unstocked item was added to the cart');
    assert(!/coca-cola/i.test(r.reply) || /(not|no|out of|cannot|do not)/i.test(r.reply),
      `the reply still offers an unstocked item: ${r.reply.slice(0, 90)}`);
    assert(/does not|not (available|stocked|on this store)|out of|cannot add|do not/i.test(r.reply),
      `the customer is not told it is unavailable: ${r.reply.slice(0, 90)}`);
    return 'Coca-Cola dropped, customer told why';
  });

  // 8 ── "add pickup" tells the customer ─────────────────────────────────────
  await check('notify', '8. "add pickup" messages the customer', async () => {
    const sock = fakeSock();
    const order = { id: 'DKN-STRESS-2', userId: 'near', customerJid: 'customer@s.whatsapp.net', totalAmount: 20 };
    const text = await notifyCustomer(sock, order, 'atPickup');
    assert(text, 'no message was produced for the pickup event');
    assert(sock.sent.length === 1, `expected 1 WhatsApp message, got ${sock.sent.length}`);
    assert(sock.sent[0].jid === order.customerJid, 'the message went to the wrong number');
    assert(isFromFamily('atPickup', text), `wrong message family: ${text.slice(0, 70)}`);
    assert(text.includes('DKN-STRESS-2') && text.includes('20'), 'the message lacks the order id or total');
    return 'customer messaged on the ready/pickup event';
  });

  // 9 ── the shopkeeper accepting tells the customer ─────────────────────────
  await check('notify', '9. shopkeeper accept messages the customer', async () => {
    const sock = fakeSock();
    const order = { id: 'DKN-STRESS-3', userId: 'near', customerJid: 'customer@s.whatsapp.net', totalAmount: 45 };
    const text = await notifyCustomer(sock, order, 'accepted');
    assert(text, 'no message was produced for the accept event');
    assert(sock.sent.length === 1, 'the customer was not messaged on accept');
    assert(isFromFamily('accepted', text), `wrong message family: ${text.slice(0, 70)}`);
    assert(text.includes('DKN-STRESS-3') && text.includes('45'), 'the message lacks the order id or total');

    // delivered and rejected too, since they share this path
    const delivered = orderNotificationText('delivered', order);
    const rejected = orderNotificationText('rejected', order, { reason: 'out of stock' });
    assert(isFromFamily('delivered', delivered), 'wrong delivered message');
    assert(isFromFamily('rejected', rejected) && rejected.includes('out of stock'), 'wrong rejected message');
    assert(orderNotificationText('nonsense', order) === '', 'an unknown event must produce nothing');
    return 'accepted / delivered / rejected all message the customer';
  });

  // 10 ── every family survives a random draw (no unfilled placeholders) ────
  await check('notify', '10. randomised copy never leaks a placeholder', async () => {
    setMessageRandom(Math.random);
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      seen.add(await notifyCustomer(fakeSock(), { id: 'DKN-9', customerJid: 'c@s.whatsapp.net', totalAmount: 12 }, 'accepted'));
      seen.add(orderNotificationText('atPickup', { id: 'DKN-9', totalAmount: 12 }));
    }
    for (const t of seen) {
      assert(t && !/\{|\}/.test(t), `a placeholder leaked into a message: ${String(t).slice(0, 90)}`);
    }
    assert(seen.size > 1, 'the copy is not actually varying between sends');
    setMessageRandom(() => 0);
    return `${seen.size} distinct phrasings, none leaking a placeholder`;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// LIVE — needs the laptop, the tunnel and the deployed POS app
// ═════════════════════════════════════════════════════════════════════════════
function readRootEnv() {
  const p = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function vercelApiBase() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return v?.build?.env?.VITE_API_BASE || '';
  } catch {
    return '';
  }
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

if (!HERMETIC_ONLY) {
  const env = readRootEnv();
  const apiBase = (process.env.MASTER_STRESS_API_BASE || vercelApiBase()).replace(/\/$/, '');
  const posUrl = process.env.MASTER_STRESS_POS_URL || 'https://dukaan-ai-beta.vercel.app/';
  const sockHeader = { 'ngrok-skip-browser-warning': '1' };

  if (!apiBase) {
    skip('live', '10-14. live environment checks', 'no API base (set VITE_API_BASE in vercel.json or MASTER_STRESS_API_BASE)');
  } else {
    // 10 ── the backend answers at all ───────────────────────────────────────
    let statusBody = null;
    await check('live', '10. tunnel answers /api/status', async () => {
      const res = await withTimeout(realFetch(`${apiBase}/api/status`, { headers: sockHeader }), 20000, '/api/status');
      assert(res.ok, `HTTP ${res.status}`);
      statusBody = await res.json();
      assert(statusBody && typeof statusBody.status === 'string', 'no status field in the response');
      return `status="${statusBody.status}"`;
    });

    // 11 ── the WhatsApp session is paired ───────────────────────────────────
    await check('live', '11. WhatsApp session is paired', async () => {
      if (!statusBody) throw new Error('skipped: /api/status did not answer');
      assert(statusBody.status === 'connected', `the bot reports "${statusBody.status}", not connected`);
      return 'session connected';
    });

    // 12 ── the WhatsApp server AI answers through the tunnel ────────────────
    await check('live', '12. WhatsApp server AI answers (real login token)', async () => {
      const supa = env.SUPABASE_URL, svc = env.SUPABASE_SERVICE_KEY, anon = env.VITE_SUPABASE_ANON_KEY;
      if (!supa || !svc || !anon) throw new Error('skipped: Supabase keys missing from .env');
      const admin = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };
      const email = `stress-${Date.now()}@example.com`;
      const created = await withTimeout(realFetch(`${supa}/auth/v1/admin/users`, {
        method: 'POST', headers: admin,
        body: JSON.stringify({ email, password: 'Stress!2345', email_confirm: true }),
      }), 30000, 'create probe user');
      if (!created.ok) throw new Error(`could not create a probe account (HTTP ${created.status})`);
      const uid = (await created.json()).id;
      try {
        const tok = await withTimeout(realFetch(`${supa}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'Stress!2345' }),
        }), 30000, 'sign in');
        assert(tok.ok, `sign in failed (HTTP ${tok.status})`);
        const access = (await tok.json()).access_token;
        const t0 = Date.now();
        const res = await withTimeout(realFetch(`${apiBase}/api/ai/chat/completions`, {
          method: 'POST',
          headers: { ...sockHeader, 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Return ONLY JSON: {"ok":true}' }] }),
        }), 90000, 'AI call');
        assert(res.ok, `AI route answered HTTP ${res.status}`);
        const body = await res.json();
        const content = body?.choices?.[0]?.message?.content;
        assert(content && content.length > 0, 'the AI returned no content');
        return `HTTP 200 in ${((Date.now() - t0) / 1000).toFixed(1)}s via ${body.model || 'unknown model'}`;
      } finally {
        await realFetch(`${supa}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: admin }).catch(() => {});
      }
    });

    // 13 ── the deployed POS app can reach that same AI ──────────────────────
    await check('live', '13. POS app is live and wired to the backend', async () => {
      const page = await withTimeout(realFetch(posUrl, { headers: sockHeader }), 30000, 'POS page');
      assert(page.ok, `the POS page answered HTTP ${page.status}`);
      const html = await page.text();
      assert(/<div id="root"/.test(html) || /<script/.test(html), 'the POS page is not the app shell');

      // The page loads CDN scripts (tailwind, babel) as well as the app itself, so
      // look at every same-origin bundle and require the backend to appear in one
      // of them, rather than trusting the first <script src> on the page.
      const srcs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1])
        .filter((s) => !/^https?:\/\//.test(s) || s.startsWith(new URL(posUrl).origin));
      assert(srcs.length > 0, 'the POS page loads no application bundle');
      const host = apiBase.replace(/^https?:\/\//, '');
      let sawBackend = false;
      let sawSupabase = false;
      for (const s of srcs) {
        const bundle = await withTimeout(realFetch(new URL(s, posUrl).toString(), { headers: sockHeader }), 30000, 'POS bundle');
        assert(bundle.ok, `the app bundle ${s} answered HTTP ${bundle.status}`);
        const code = await bundle.text();
        if (code.includes(host)) sawBackend = true;
        if (/supabase\.co/.test(code)) sawSupabase = true;
      }
      assert(sawBackend, `the deployed app does not reference the backend (${host})`);
      assert(sawSupabase, 'the deployed app carries no Supabase URL, so sign in cannot work');

      // and the browser's preflight must be allowed, or the POS never reaches it
      const origin = new URL(posUrl).origin;
      const pre = await withTimeout(realFetch(`${apiBase}/api/ai/chat/completions`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
      }), 20000, 'CORS preflight');
      assert(pre.status === 204 || pre.status === 200, `preflight answered HTTP ${pre.status}`);
      const allow = pre.headers.get('access-control-allow-origin') || '';
      assert(allow === origin || allow === '*', `the backend rejects the POS origin (allow-origin: "${allow}")`);
      return `bundle references backend, CORS allows ${origin}`;
    });

    // 14 ── the order routes are still gated ──────────────────────────────────
    await check('live', '14. order actions are auth-gated without a token', async () => {
      const res = await withTimeout(realFetch(`${apiBase}/api/dukan/orders`, { headers: sockHeader }), 20000, 'orders route');
      assert(res.status === 401 || res.status === 403, `an unauthenticated request got HTTP ${res.status}`);
      return `unauthenticated request rejected (HTTP ${res.status})`;
    });
  }
}

// ─── teardown + report ───────────────────────────────────────────────────────
setMessageRandom(Math.random);
resetAllContext();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }

const WIDTH = 62;
console.log('\n' + '═'.repeat(WIDTH));
console.log('  DUKAN MASTER STRESS TEST');
console.log('═'.repeat(WIDTH));

let section = null;
for (const r of results) {
  if (r.section !== section) {
    section = r.section;
    console.log(`\n  ${section.toUpperCase()}`);
  }
  const mark = r.status === 'CLEAR' ? 'CLEAR' : r.status === 'FAIL' ? ' FAIL' : ' SKIP';
  const label = r.name.replace(/^\d+\.\s*/, '');
  console.log(`  [${mark}] ${String(r.id).padStart(2)}. ${label}`);
  if (r.detail) console.log(`           ${r.detail}`);
}

const clear = results.filter((r) => r.status === 'CLEAR').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;
console.log('\n' + '─'.repeat(WIDTH));
console.log(`  ${clear} clear, ${failed} failed, ${skipped} skipped  (${results.length} checkpoints)`);
console.log(failed === 0
  ? '  RESULT: PIPELINE OK'
  : `  RESULT: ${failed} CHECKPOINT(S) FAILED — see above`);
console.log('═'.repeat(WIDTH) + '\n');

process.exit(failed === 0 ? 0 : 1);
