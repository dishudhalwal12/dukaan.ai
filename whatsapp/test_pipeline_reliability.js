import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * RELIABILITY HARNESS
 *
 * Runs the whole routing pipeline end to end, many times, over an adversarial
 * matrix and a randomized loop, and checks the same invariants every time:
 *
 *   I1  An order exists ⟹ a shop is connected for that customer and the order is
 *       owned by exactly that shop.
 *   I2  An order exists ⟹ it has items, and every item is in that shop's catalog.
 *   I3  An order exists ⟹ it carries the customer's pin address.
 *   I4  An order exists ⟹ the shop is within the delivery radius (or the dev
 *       fallback local shop).
 *   I5  With a live registry and no shop connected, NO order can be created.
 *   I6  With a live registry, an out-of-range / ownerless / empty-catalog shop can
 *       never receive an order.
 *   I7  An order is placed ⟺ the gate put something in the cart (no lost eligible
 *       order, no phantom order).
 *
 * Exits non-zero below 100%.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-rel-'));
process.env.DUKAN_ORDERS_FILE = path.join(tmpDir, 'orders.json');

const { dukanOrders } = await import('./dukanOrders.js');
const bot = await import('./dukanBot.js');

const RADIUS = 5;
const PIN = { latitude: 26.9124, longitude: 75.7873, name: 'Model Town', address: 'Model Town, Jaipur', fullDescription: 'Model Town, Jaipur' };
const atKm = (km, lngOffset = 0) => ({ latitude: PIN.latitude + km / 111.19, longitude: PIN.longitude + lngOffset });

// Deterministic PRNG so a failure is reproducible from its seed.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOGS = {
  small: (u) => ([
    { user_id: u, external_id: 'product_parle_g', name: 'Parle-G Biscuits', price: '10', stock: 50, stock_unit: 'pack', attributes: { category: 'Biscuits' } },
    { user_id: u, external_id: 'product_amul_milk', name: 'Amul Taaza Milk', price: '27', stock: 9, stock_unit: '500ml', attributes: {} },
  ]),
  ambiguous: (u) => ([
    { user_id: u, external_id: 'm1', name: 'Maggi 2-Minute Noodles', price: '15', stock: 5, stock_unit: 'packet', attributes: {} },
    { user_id: u, external_id: 'm2', name: 'Maggi Special Masala Noodles', price: '20', stock: 5, stock_unit: 'packet', attributes: {} },
    { user_id: u, external_id: 'm3', name: 'Maggi Atta Noodles', price: '25', stock: 5, stock_unit: 'packet', attributes: {} },
  ]),
  empty: () => [],
};

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

let fetchStub = null;
function stubFetch({ profiles, products, fail }) {
  fetchStub = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/business_profiles')) return fail ? json({ message: 'down' }, 500) : json(profiles || []);
    if (u.includes('/rest/v1/products')) {
      const m = u.match(/user_id=eq\.([^&]+)/);
      if (m) return json((products || {})[decodeURIComponent(m[1])] || []);
      const all = Object.entries(products || {}).flatMap(([user_id, rows]) => rows.map(() => ({ user_id })));
      return json(all);
    }
    return json({ message: 'not stubbed' }, 503); // AI endpoints: fail fast, no network
  };
}

let jidSeq = 0;
async function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; }
}

/**
 * Scenarios are plain data, so the matrix and the random loop build the same
 * object. Every field has a safe default.
 */
async function runScenario(s) {
  const jid = `9${1000000000 + (++jidSeq)}@s.whatsapp.net`;
  const radius = s.radius ?? RADIUS;

  process.env.DUKAN_MAX_DELIVERY_KM = String(radius);
  if (s.cloud === 'configured') {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'k';
    stubFetch(s.cloudStub);
  } else {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
  if (s.owner) process.env.DUKAN_DEFAULT_OWNER_ID = s.owner;
  else delete process.env.DUKAN_DEFAULT_OWNER_ID;

  globalThis.fetch = (u, init) => fetchStub(u, init);

  const msg = (text) => ({ remoteJid: jid, text, pushName: 'Cust', from: jid.replace(/@.*$/, '') });

  return quiet(async () => {
    bot.resetAllContext();
    dukanOrders.clear();

    await bot.dukanBot.handleMessage(msg('/hey'), null);
    if (s.pin) await bot.dukanBot.handleMessage(msg(''), null, s.pin);

    const shop = bot.activeShops.get(jid) || null;

    // Order through the REAL gate (no shortcuts), then confirm.
    if (s.requested) {
      bot.executeModelActions([{ type: 'ADD_TO_CART', args: { name: s.requested, qty: 1 } }], jid, 'Cust', msg('').from, s.pin || null);
    }
    const afterGate = bot.customerCarts.get(jid) || null;
    const cartItems = (afterGate?.items || []).length;

    const confirm = await bot.dukanBot.handleMessage(msg('confirm'), null);

    return { shop, cartItems, order: confirm?.newOrder || null, reply: confirm?.reply || '' };
  });
}

function checkInvariants(s, r, problems) {
  const { shop, order, cartItems } = r;
  const radius = s.radius ?? RADIUS;
  const push = (m) => problems.push(m);

  // I7 — order ⟺ the gate filled the cart.
  if (cartItems > 0 && !order) push('a filled cart did not produce an order');
  if (cartItems === 0 && order) push('an empty cart produced an order');

  if (order) {
    // I1 — owner is exactly the connected shop.
    if (!shop) push('order created with no connected shop');
    else if (order.userId !== shop.userId) push(`order owned by ${order.userId}, not the connected shop ${shop.userId}`);
    if (!order.userId) push('order has no owner (invisible to every shopkeeper)');

    // I2 — items exist and come from the shop's catalog.
    if (!order.items || order.items.length === 0) push('order has no items');
    else if (shop) {
      const ids = new Set((shop.catalog || []).map((p) => String(p.id)));
      for (const it of order.items) if (!ids.has(String(it.id))) push(`item "${it.name}" is not in the shop catalog`);
    }

    // I3 — the pin address reaches the order.
    if (s.pin && order.deliveryAddress !== s.pin.fullDescription) push('order lost the pin address');

    // I4 — the shop is in range (or the dev fallback).
    if (shop && !shop.isFallback && Number.isFinite(shop.distanceKm) && shop.distanceKm > radius + 1e-9) {
      push(`order from a shop ${shop.distanceKm.toFixed(2)} km away (radius ${radius})`);
    }

    // I6 — an order can never come from a shop that cannot serve.
    if (shop && !shop.isFallback && !Number.isFinite(shop.distanceKm)) push('matched shop has no distance');

    // I5 — with a live registry and no connected shop, nothing may be ordered.
    if (s.cloud === 'configured' && !shop) push('a live registry with no shop still produced an order');
  }

  // I5 — no connected shop + live registry ⟹ nothing entered the cart either.
  if (s.cloud === 'configured' && !shop && cartItems > 0) push('a live registry with no shop still filled the cart');
}

// ─── the adversarial matrix ───────────────────────────────────────────────────

const CLOUDS = ['unconfigured', 'configured'];
const PINS = [PIN, null];
const OWNERS = ['dev-owner', null];
const SHOP_SHAPES = ['none', 'ownerless', 'in-range', 'boundary', 'out-of-range', 'mixed-near-small-far-big', 'mixed-far-near'];
const CATALOGS_KIND = ['small', 'ambiguous', 'empty'];
const REQUESTS = ['Parle-G Biscuits', 'Coca-Cola', 'maggi', 'zzz-unknown-item', null];

function cloudStubFor(shape, catalogKind, fail) {
  const prof = (userId, name, pos) => ({ user_id: userId, store_name: name, store_lat: pos.latitude, store_lng: pos.longitude });
  const cat = (uid) => CATALOGS[catalogKind](uid);
  switch (shape) {
    case 'none': return { profiles: [], products: {}, fail };
    case 'ownerless': return { profiles: [{ user_id: '', store_name: 'Ghost', store_lat: atKm(0.2).latitude, store_lng: PIN.longitude }], products: {}, fail };
    case 'in-range': return { profiles: [prof('near', 'Near', atKm(0.4))], products: { near: cat('near') }, fail };
    case 'boundary': return { profiles: [prof('edge', 'Edge', atKm(RADIUS))], products: { edge: cat('edge') }, fail };
    case 'out-of-range': return { profiles: [prof('far', 'Far', atKm(9))], products: { far: cat('far') }, fail };
    case 'mixed-near-small-far-big': return {
      profiles: [prof('near', 'Near', atKm(0.3)), prof('big', 'Big', atKm(2.5))],
      products: { near: cat('near'), big: [...cat('big'), ...cat('big'), ...cat('big')] }, fail,
    };
    case 'mixed-far-near': return {
      profiles: [prof('big', 'Big', atKm(2.5)), prof('near', 'Near', atKm(0.3))],
      products: { near: cat('near'), big: [...cat('big'), ...cat('big')] }, fail,
    };
    default: return { profiles: [], products: {}, fail };
  }
}

function buildMatrix() {
  const all = [];
  for (const cloud of CLOUDS) {
    for (const pin of PINS) {
      for (const owner of OWNERS) {
        for (const shape of SHOP_SHAPES) {
          for (const catalogKind of CATALOGS_KIND) {
            for (const requested of REQUESTS) {
              for (const fail of [false, true]) {
                if (cloud === 'unconfigured' && (shape !== 'none' || fail)) continue; // no registry to fail
                all.push({
                  cloud, pin, owner, shape, catalogKind, requested, fail,
                  cloudStub: cloudStubFor(shape, catalogKind, fail),
                  radius: RADIUS,
                });
              }
            }
          }
        }
      }
    }
  }
  return all;
}

// ─── the randomized loop ──────────────────────────────────────────────────────

function randomScenario(rand) {
  const cloud = rand() < 0.7 ? 'configured' : 'unconfigured';
  const shape = SHOP_SHAPES[Math.floor(rand() * SHOP_SHAPES.length)];
  const catalogKind = CATALOGS_KIND[Math.floor(rand() * CATALOGS_KIND.length)];
  const requested = REQUESTS[Math.floor(rand() * REQUESTS.length)];
  const requestSpec = requested ?? (rand() < 0.5 ? 'Parle-G Biscuits' : null);
  return {
    cloud,
    pin: rand() < 0.9 ? PIN : null,
    owner: rand() < 0.5 ? 'dev-owner' : null,
    shape, catalogKind, requested: requestSpec, fail: rand() < 0.15,
    cloudStub: cloudStubFor(shape, catalogKind, rand() < 0.15),
    radius: [1, 2, 3, 5, 10][Math.floor(rand() * 5)],
  };
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function runAll(label, scenarios) {
  let pass = 0;
  const failures = [];
  for (const s of scenarios) {
    const problems = [];
    try {
      const r = await runScenario(s);
      checkInvariants(s, r, problems);
    } catch (e) {
      problems.push(`threw: ${e.message}`);
    }
    if (problems.length === 0) pass++;
    else if (failures.length < 8) failures.push({ scenario: s, problems });
  }
  const rate = (pass / scenarios.length) * 100;
  console.log(`${label}: ${pass}/${scenarios.length} passed — ${rate.toFixed(2)}%`);
  for (const f of failures) {
    console.log(`  ✗ ${JSON.stringify({ cloud: f.scenario.cloud, pin: !!f.scenario.pin, owner: f.scenario.owner, shape: f.scenario.shape, catalog: f.scenario.catalogKind, requested: f.scenario.requested, fail: f.scenario.fail, radius: f.scenario.radius })}`);
    for (const p of f.problems) console.log(`      - ${p}`);
  }
  return rate;
}

console.log('--- RUNNING PIPELINE RELIABILITY HARNESS (T6) ---');

const matrix = buildMatrix();
console.log(`Adversarial matrix: ${matrix.length} scenarios`);

const matrixRate = await runAll('Matrix', matrix);

const rand = mulberry32(20261016);
const loop = Array.from({ length: 500 }, () => randomScenario(rand));
const loopRate = await runAll('Randomized loop (seed 20261016)', loop);

const overall = Math.min(matrixRate, loopRate);
console.log('\n========================================');
console.log(`RELIABILITY: matrix ${matrixRate.toFixed(2)}%  ·  loop ${loopRate.toFixed(2)}%  ·  overall ${overall.toFixed(2)}%`);
console.log('========================================');

fs.rmSync(tmpDir, { recursive: true, force: true });
if (overall < 100) {
  console.error(`\n❌ RELIABILITY BELOW 100% (${overall.toFixed(2)}%)`);
  process.exit(1);
}
assert.ok(true);
console.log('🎉 100% RELIABILITY: every invariant held on every run');
