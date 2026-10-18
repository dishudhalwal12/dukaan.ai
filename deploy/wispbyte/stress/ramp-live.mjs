/**
 * Concurrency ramp against the REAL production path:
 *   Mac → ngrok tunnel → the laptop's bot → Supabase (token verify, cached 60s)
 *
 * Each virtual shopkeeper repeats the app's own poll: GET /api/status (public,
 * every 2.5s in the app) and GET /api/dukan/orders (authenticated). Think time
 * is zero here, so the numbers are a ceiling, not a forecast.
 *
 * Reads the service key from .env to mint one real session; never prints it.
 */
import { readFileSync } from 'node:fs';

const TUN = process.env.BASE || 'https://aurelio-chasmy-dorsiventrally.ngrok-free.dev';
const ORIGIN = 'https://dukaan-ai-beta.vercel.app';

// The app polls every 2.5s. THINK_MS reproduces that; 0 saturates instead.
const THINK = Number(process.env.THINK_MS || 0);
const LEVELS = (process.env.LEVELS || '5,10,25,50,100').split(',').map(Number);
const SECS = Number(process.env.LEVEL_S || 10);
const SOAK_S = Number(process.env.SOAK_S || 60);

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const asupabase = async (path, body) => {
  const r = await fetch(env.SUPABASE_URL + path, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
};

const link = await asupabase('/auth/v1/admin/generate_link', { type: 'magiclink', email: 'beyounicklikedishu@gmail.com' });
const { access_token: TOKEN } = await asupabase('/auth/v1/verify', { type: 'magiclink', token_hash: link.hashed_token });
console.log(`  real session: ${TOKEN ? 'minted' : 'FAILED'}\n`);

const hdrs = { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN, 'ngrok-skip-browser-warning': '1' };

const one = async (path) => {
  const t = performance.now();
  try {
    const r = await fetch(TUN + path, { headers: hdrs });
    await r.arrayBuffer();
    return { ms: performance.now() - t, ok: r.ok, code: r.status };
  } catch (e) {
    const errCode = e?.cause?.code || e?.code || e?.message || 'ERR';
    return { ms: performance.now() - t, ok: false, code: errCode };
  }
};

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

async function level(n, seconds) {
  const lat = []; let errs = 0; let reqs = 0; const codes = {};
  const stop = Date.now() + seconds * 1000;
  const worker = async () => {
    while (Date.now() < stop) {
      for (const path of ['/api/status', '/api/dukan/orders']) {
        const r = await one(path);
        reqs++; lat.push(r.ms);
        if (!r.ok) { errs++; codes[r.code] = (codes[r.code] || 0) + 1; }
      }
      if (THINK) await new Promise((r2) => setTimeout(r2, THINK));
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  const rps = (reqs / seconds).toFixed(0);
  return { n, reqs, rps, errs, codes, p50: pct(lat, 0.5).toFixed(0), p95: pct(lat, 0.95).toFixed(0), p99: pct(lat, 0.99).toFixed(0) };
}

console.log(`  think time: ${THINK ? THINK + 'ms (the app\'s real 2.5s poll)' : 'none (saturated ceiling)'}\n`);
console.log('  clients |   reqs |  req/s |   p50 |   p95 |   p99 | errors');
console.log('  --------+--------+--------+-------+-------+-------+-------');
for (const n of LEVELS) {
  const r = await level(n, SECS);
  console.log(`  ${String(r.n).padStart(7)} | ${String(r.reqs).padStart(6)} | ${String(r.rps).padStart(6)} | ${String(r.p50).padStart(5)} | ${String(r.p95).padStart(5)} | ${String(r.p99).padStart(5)} | ${r.errs}${r.errs ? ' ' + JSON.stringify(r.codes) : ''}`);
  await new Promise((r2) => setTimeout(r2, 1500));
}

if (SOAK_S) {
  console.log(`\n  soak: ${LEVELS[LEVELS.length - 1]} clients for ${SOAK_S}s (steady state)`);
  const soak = await level(LEVELS[LEVELS.length - 1], SOAK_S);
  console.log(`  ${soak.reqs} requests, ${soak.rps} req/s, p95 ${soak.p95}ms, p99 ${soak.p99}ms, ${soak.errs} errors`);
}
