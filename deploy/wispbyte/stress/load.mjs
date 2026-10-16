#!/usr/bin/env node
// Virtual POS clients — dependency-free. Mirrors what the real browser does:
//   * every shopkeeper holds one SSE stream (/events) for the live chime
//   * every shopkeeper polls /api/dukan/orders every 2.5 s (App.tsx:544)
//   * on load the POS reads /api/status, /api/dukan/catalog, /api/dukan/stats
//     and pushes /api/dukan/catalog/sync
// Everything goes through the same-origin proxy, exactly as it will on Vercel.
const BASE = process.env.BASE || 'http://127.0.0.1:4180';
const CLIENTS = Number(process.env.CLIENTS || 5);
const POLL_MS = Number(process.env.POLL_MS || 2500);
const SOAK_S = Number(process.env.SOAK_S || 60);
const BURST_TOTAL = Number(process.env.BURST_TOTAL || 3000);
const BURST_CONC = Number(process.env.BURST_CONC || 50);
const SKIP_BURST = process.env.SKIP_BURST === '1';
const SKIP_SOAK = process.env.SKIP_SOAK === '1';

const burstMs = [];
const soakMs = [];
let ok = 0;
let fail = 0;
const errors = new Map();

function note(key, bucket) {
  const k = String(key).slice(0, 48);
  errors.set(k, (errors.get(k) || 0) + 1);
  fail++;
  void bucket;
}

async function call(url, init, bucket) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, init);
    await res.arrayBuffer();
    if (!res.ok) return note(`HTTP ${res.status} ${url}`, bucket);
    bucket.push(performance.now() - t0);
    ok++;
  } catch (e) {
    const code = e?.cause?.code || e?.name || e?.message || 'error';
    note(`${code} ${url}`, bucket);
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// ── burst: max throughput on the read paths ─────────────────────────────────
async function burst() {
  const reads = ['/api/status', '/api/dukan/catalog', '/api/dukan/stats', '/api/dukan/orders?userId=stress-1'];
  const syncBody = JSON.stringify({
    products: [{ id: 'p1', name: 'Milk 500ml', price: 30, unit: 'pc', inStock: true }],
  });
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= BURST_TOTAL) return;
      if (i % 10 === 9) {
        await call(
          `${BASE}/api/dukan/catalog/sync`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: syncBody },
          burstMs,
        );
      } else {
        await call(BASE + reads[i % reads.length], undefined, burstMs);
      }
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: BURST_CONC }, worker));
  return performance.now() - t0;
}

// ── soak: CLIENTS shopkeepers, steady state ─────────────────────────────────
async function soak() {
  const timers = [];
  const sse = { msgs: 0, errors: 0 };
  const abort = new AbortController();

  const client = async (i) => {
    // Load-time reads, like a real page load.
    await call(`${BASE}/api/status`, undefined, soakMs);
    await call(`${BASE}/api/dukan/catalog`, undefined, soakMs);

    const poll = setInterval(() => {
      void call(`${BASE}/api/dukan/orders?userId=stress-${i}`, undefined, soakMs);
    }, POLL_MS);
    timers.push(() => clearInterval(poll));

    try {
      const res = await fetch(`${BASE}/events`, {
        headers: { accept: 'text/event-stream' },
        signal: abort.signal,
      });
      if (!res.ok) {
        sse.errors++;
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          buf = buf.slice(idx + 2);
          sse.msgs++;
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) sse.errors++;
    }
  };

  const clients = Array.from({ length: CLIENTS }, (_, i) => client(i + 1));
  await new Promise((r) => setTimeout(r, SOAK_S * 1000));
  abort.abort();
  timers.forEach((stop) => stop());
  await Promise.allSettled(clients);
  return sse;
}

const out = { clients: CLIENTS, burst_total: BURST_TOTAL, burst_conc: BURST_CONC, soak_s: SOAK_S };

if (!SKIP_BURST) {
  const secs = (await burst()) / 1000;
  out.burst = {
    requests: burstMs.length + fail,
    seconds: Number(secs.toFixed(2)),
    rps: Math.round((burstMs.length + fail) / secs),
  };
}

if (!SKIP_SOAK) {
  const sse = await soak();
  out.soak = sse;
}

out.ok = ok;
out.fail = fail;
const total = ok + fail;
out.success_rate = total ? Number(((ok / total) * 100).toFixed(3)) : 100;
out.p50_burst_ms = Number(pct(burstMs, 50).toFixed(1));
out.p95_burst_ms = Number(pct(burstMs, 95).toFixed(1));
out.p99_burst_ms = Number(pct(burstMs, 99).toFixed(1));
out.p95_soak_ms = Number(pct(soakMs, 95).toFixed(1));
out.errors = Object.fromEntries([...errors].sort((a, b) => b[1] - a[1]).slice(0, 8));

console.log('SUMMARY ' + JSON.stringify(out));

const pass = out.success_rate >= 99.9 && out.p95_burst_ms < 250 && (SKIP_SOAK || out.soak.errors === 0);
console.log(pass ? 'RESULT PASS' : 'RESULT FAIL');
process.exit(pass ? 0 : 1);
