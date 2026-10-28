#!/usr/bin/env node
/**
 * DUKAN MASTER STRESS TEST v2 — one command, every layer, and a diagnosis.
 *
 * v1 answered "is the pipeline working?". v2 answers "WHAT is broken?" — every
 * checkpoint knows which subsystem it belongs to and what its failure means, so
 * a red line reaches the actual cause instead of a generic error.
 *
 * It walks the whole stack, outside in:
 *
 *   CONFIG     the files this machine would deploy (no network). A mismatch
 *              between the app's Supabase project and the bot's is the failure
 *              that makes every browser request 401 while the UI looks signed in.
 *   LOGIC      the real bot conversation, driven hermetically in child
 *              processes: the regression net from v1 plus every unit suite, so a
 *              red test names the module.
 *   SURFACE    the bot's public HTTP surface, fetched with `curl` exactly as a
 *              human would: health, the POS build, real assets, and the negative
 *              cases (a missing asset must 404, not serve HTML with a 200).
 *   AUTH       the trust boundary, with a throwaway Supabase account: no token,
 *              a bad token, and a real token must each get their own answer.
 *   AI         both proxy paths (JSON and SSE) with a real login token, because
 *              this is what "insights / onboarding" actually depend on.
 *   ORDERS     the order routes, without touching a live order.
 *   MCP        the Vercel MCP surface: health, discovery, RFC 9728 challenge,
 *              initialize, tools/list. MCP orders arrive through here.
 *   POS        the deployed app and the CORS preflight that decides whether it
 *              can reach the bot at all.
 *
 * Usage
 *   node master_stress_test_v2.js              everything (needs the network)
 *   node master_stress_test_v2.js --offline    config + logic only
 *   node master_stress_test_v2.js --fast       skip the child-process suites
 *   node master_stress_test_v2.js --full       also run `npm test`
 *   node master_stress_test_v2.js --verbose    print the curl for every check
 *
 * Exit code is 0 only when nothing FAILED. SKIP is not a failure: it means the
 * check could not run here (no keys, no network) and says why.
 *
 * Nothing here prints a secret. Keys are reported by NAME and length only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const OFFLINE = process.argv.includes('--offline');
const FAST = process.argv.includes('--fast');
const FULL = process.argv.includes('--full');
const VERBOSE = process.argv.includes('--verbose');

const SOCK = { 'ngrok-skip-browser-warning': '1' };
const WIDTH = 74;

// ─── result collection ───────────────────────────────────────────────────────
const results = [];
const cleanup = [];
let seq = 0;

/**
 * @param {string} section
 * @param {string} name
 * @param {() => Promise<string|void>} fn
 * @param {{hint?: string, curl?: string, needs?: string}} meta
 *   hint  what a failure of this check MEANS (printed when it fails)
 *   curl  the exact command that reproduces it
 *   needs the capability this check requires; a failure is reported SKIP
 */
async function check(section, name, fn, meta = {}) {
  const id = ++seq;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, section, name, status: 'CLEAR', detail: detail || '', ms: Date.now() - started, ...meta });
  } catch (e) {
    if (e && e.__skip) {
      results.push({ id, section, name, status: 'SKIP', detail: e.message, ...meta });
      return;
    }
    const cause = e?.cause?.code ? ` (${e.cause.code})` : '';
    results.push({ id, section, name, status: 'FAIL', detail: `${e.message}${cause}`, ms: Date.now() - started, ...meta });
  }
}

const skipError = (why) => Object.assign(new Error(why), { __skip: true });
const skip = (section, name, why, meta = {}) =>
  results.push({ id: ++seq, section, name, status: 'SKIP', detail: why, ...meta });

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const ms = (n) => `${n} ms`;
const short = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

// ─── config helpers ──────────────────────────────────────────────────────────
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const projectRef = (url) => {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\./i.exec(String(url || '').trim());
  return m ? m[1] : '';
};

const ENV_FILE = path.join(ROOT, '.env');
const ENV = readEnvFile(ENV_FILE);
const VERCEL = readJson(path.join(ROOT, 'vercel.json')) || {};
const BUILD_ENV = VERCEL?.build?.env || {};

const API_BASE = String(process.env.MASTER_STRESS_API_BASE || BUILD_ENV.VITE_API_BASE || '').replace(/\/+$/, '');
const MCP_URL = String(BUILD_ENV.VITE_MCP_URL || '').replace(/\/+$/, '');
const MCP_ORIGIN = MCP_URL ? new URL(MCP_URL).origin : '';
const POS_URL = String(process.env.MASTER_STRESS_POS_URL || (MCP_ORIGIN || '')).replace(/\/+$/, '');

const SUPA_URL = String(ENV.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_SERVICE = String(ENV.SUPABASE_SERVICE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY || '');
const SUPA_ANON = String(ENV.VITE_SUPABASE_ANON_KEY || '');

const HAS_CURL = spawnSync('curl', ['--version'], { encoding: 'utf8' }).status === 0;
const NETWORK = !OFFLINE && Boolean(API_BASE);

const onlyFlag = (args) => args;

// ─── transports ──────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch.bind(globalThis);

async function withTimeout(promise, limitMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${limitMs} ms`)), limitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** fetch with one retry, for a flaky tunnel rather than a broken route. */
async function fetchRetry(url, init = {}, retries = 1) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await realFetch(url, init);
    } catch (err) {
      last = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

/**
 * A check the way a human would run it: `curl`, status and content-type only.
 * Returns the body too, and the command used, so a failure can print it.
 */
function curlProbe(url, { method = 'GET', headers = {}, body = null, timeout = 25, expectStream = false } = {}) {
  const args = ['-sS', '-m', String(timeout), '-o', BODY_FILE, '-w', '%{http_code}|%{content_type}', '-X', method];
  for (const [k, v] of Object.entries({ ...SOCK, ...headers })) args.push('-H', `${k}: ${v}`);
  if (body != null) args.push('--data', typeof body === 'string' ? body : JSON.stringify(body));
  args.push(url);

  const cmd = `curl ${args.map((a) => (/[\s|]/.test(a) ? `'${a}'` : a)).join(' ')}`;
  const out = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (out.error) throw new Error(`curl could not run: ${out.error.message}`);
  const [codeRaw, typeRaw] = String(out.stdout || '').trim().split('|');
  const code = Number(codeRaw);
  if (!Number.isFinite(code) || code === 0) {
    throw new Error(`curl got no status (${short(out.stderr, 120) || 'no output'})`);
  }
  let text = '';
  try {
    text = fs.readFileSync(BODY_FILE, 'utf8');
  } catch {
    /* no body file: empty response */
  }
  return { code, contentType: String(typeRaw || ''), text, cmd, url, expectStream };
}

const BODY_FILE = path.join(os.tmpdir(), `dukan-v2-probe-${process.pid}.out`);

/** fetch-based probe with a status, parsed body and the equivalent curl command. */
async function httpProbe(url, { method = 'GET', headers = {}, body = null, timeout = 30000 } = {}) {
  const init = { method, headers: { ...SOCK, ...headers } };
  if (body != null) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await withTimeout(fetchRetry(url, init), timeout, `${method} ${url}`);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const curl = `curl -sS -m ${Math.round(timeout / 1000)} -X ${method}${Object.entries({ ...SOCK, ...headers })
    .map(([k, v]) => ` -H '${k}: ${v}'`)
    .join('')}${body != null ? ` --data '${short(typeof body === 'string' ? body : JSON.stringify(body), 80)}'` : ''} ${url}`;
  return { status: res.status, ok: res.ok, headers: res.headers, text, json, curl, url };
}

const jsonOf = (probe, label) => {
  assert(probe.json !== null, `${label} did not return JSON: ${short(probe.text, 120)}`);
  return probe.json;
};

// ─── header ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(WIDTH));
console.log('  DUKAN MASTER STRESS TEST v2');
console.log('═'.repeat(WIDTH));
console.log(`  mode        ${OFFLINE ? 'offline (config + logic)' : FAST ? 'live, no suites' : FULL ? 'live + suites + npm test' : 'live + suites'}`);
console.log(`  node        ${process.version}`);
console.log(`  bot api     ${API_BASE || '(none — set VITE_API_BASE in vercel.json)'}`);
console.log(`  mcp         ${MCP_URL || '(none)'}`);
console.log(`  pos         ${POS_URL || '(none)'}`);
console.log(`  supabase    ${projectRef(SUPA_URL) || '(unset)'} · service key ${SUPA_SERVICE ? `present (${SUPA_SERVICE.length} chars)` : 'MISSING'} · anon key ${SUPA_ANON ? 'present' : 'MISSING'}`);
console.log(`  curl        ${HAS_CURL ? 'available — public surface is checked with curl' : 'not found — falling back to fetch'}`);

// ════════════════════════════════════════════════════════════════════════════
// CONFIG — what this machine would deploy. No network.
// ════════════════════════════════════════════════════════════════════════════
const CONFIG = 'config';

await check(CONFIG, 'the root .env exists and carries the keys the bot needs', async () => {
  assert(fs.existsSync(ENV_FILE), 'no .env at the repo root — the bot reads that file, not whatsapp/.env');
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY'];
  const missing = required.filter((k) => !ENV[k]);
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
  const ai = ['OPENROUTER_API_KEY', 'GROQ_API_KEY'].filter((k) => ENV[k]);
  assert(ai.length > 0, 'neither OPENROUTER_API_KEY nor GROQ_API_KEY is set — no model can be reached');
  return `required keys present · model providers: ${ai.join(', ')}`;
}, { hint: 'the bot reads one root .env; without these it cannot verify tokens or reach Supabase', curl: 'cat .env | cut -d= -f1' });

await check(CONFIG, 'the app and the bot point at the SAME Supabase project', async () => {
  const bot = projectRef(ENV.SUPABASE_URL);
  const app = projectRef(BUILD_ENV.VITE_SUPABASE_URL);
  assert(bot, '.env SUPABASE_URL is not a Supabase project url');
  assert(app, 'vercel.json build.env.VITE_SUPABASE_URL is not a Supabase project url');
  assert(bot === app, `the bot verifies tokens for "${bot}" but the app signs in to "${app}" — every request will 401`);
  return `both use ${bot}`;
}, {
  hint: 'a token from one project is meaningless to the other; this is the 401 that looks like a broken AI',
  curl: 'grep -h SUPABASE_URL .env; grep VITE_SUPABASE_URL vercel.json',
});

await check(CONFIG, 'the built POS exists and its asset references resolve on disk', async () => {
  const index = path.join(ROOT, 'dist', 'index.html');
  assert(fs.existsSync(index), 'dist/index.html is missing — run `npm run build` at the repo root');
  const html = fs.readFileSync(index, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  assert(assets.length > 0, 'index.html references no built asset');
  const missing = assets.filter((a) => !fs.existsSync(path.join(ROOT, 'dist', a.replace(/^\//, ''))));
  assert(missing.length === 0, `index.html points at files that do not exist: ${missing.join(', ')}`);
  return `${assets.length} assets referenced, all present`;
}, { hint: 'a stale dist is served as-is by the bot; its bundle hash must exist on disk', curl: 'ls -la dist/assets | tail' });

await check(CONFIG, 'the bundle carries no loopback backend or provider key', async () => {
  const assetsDir = path.join(ROOT, 'dist', 'assets');
  assert(fs.existsSync(assetsDir), 'no dist/assets — build first');
  const bad = [];
  for (const file of fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(assetsDir, file), 'utf8');
    if (/(?:127\.0\.0\.1|localhost):8080/.test(text)) bad.push(`${file}: loopback backend URL (VITE_LLM_BASE_URL is set in .env)`);
    if (/sk-or-v1-[A-Za-z0-9]{20,}/.test(text)) bad.push(`${file}: OpenRouter key in the bundle`);
    if (/gsk_[A-Za-z0-9]{20,}/.test(text)) bad.push(`${file}: Groq key in the bundle`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js')).length} bundles clean`;
}, {
  hint: 'every shopkeeper browser would dial its own loopback and fail, or a live key would be public',
  curl: 'node scripts/check-secrets.mjs',
});

await check(CONFIG, 'the deployed app is pointed at the bot tunnel', async () => {
  assert(API_BASE, 'vercel.json build.env.VITE_API_BASE is empty — the app would call its own origin and never reach the bot');
  assert(/^https?:\/\//.test(API_BASE), `VITE_API_BASE is not an absolute url: ${API_BASE}`);
  return API_BASE;
}, { hint: 'without it the browser posts to Vercel, which has no /api routes', curl: 'grep VITE_API_BASE vercel.json' });

// ════════════════════════════════════════════════════════════════════════════
// LOGIC — the code itself, in child processes, so one red test names a module.
// ════════════════════════════════════════════════════════════════════════════
const LOGIC = 'logic';

if (FAST) {
  skip(LOGIC, 'child-process suites', 'skipped by --fast');
} else {
  const runSuite = (label, file, args = [], cwd = ROOT, want = null) => {
    const started = Date.now();
    const out = spawnSync(process.execPath, [path.join(cwd, file), ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 240000,
      env: { ...process.env },
    });
    const text = `${out.stdout || ''}\n${out.stderr || ''}`;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    // Prefer the suite's own verdict line over whatever it logged last.
    const verdict = [...lines].reverse().find((l) =>
      /(clear,|passed|pipeline ok|result:|all \d+ .* pass)/i.test(l),
    );
    const detail = short(verdict || lines[lines.length - 1] || '(no output)', 140);
    assert(out.status === 0, `${label} exited ${out.status ?? 'null'} — ${short(lines.slice(-2).join(' '), 200)}`);
    if (want) assert(new RegExp(want, 'i').test(text), `${label} did not report ${want} — ${detail}`);
    return `${label}: ${detail} · ${ms(Date.now() - started)}`;
  };

  await check(LOGIC, 'the hermetic pipeline run (v1) still passes', async () =>
    runSuite('test_master_stress --hermetic', 'whatsapp/test_master_stress.js', ['--hermetic'], ROOT, 'PIPELINE OK'),
  { hint: 'the bot conversation, store routing, order creation and notifications regressed', curl: 'node whatsapp/test_master_stress.js --hermetic' });

  const suites = [
    ['api auth (401/403 policy)', 'whatsapp/test_api_auth.js'],
    ['ai proxy payload', 'whatsapp/test_ai_proxy.js'],
    ['cors allowlist', 'whatsapp/test_cors.js'],
    ['order engine', 'whatsapp/test_order_engine.js'],
    ['order ownership scoping', 'whatsapp/test_order_ownership.js'],
    ['shop matching / radius', 'whatsapp/test_shop_matching.js'],
    ['catalog gate', 'whatsapp/test_catalog_gate.js'],
    ['status redaction', 'whatsapp/test_status_redaction.js'],
    ['POS static serving', 'whatsapp/test_static_serving.js'],
    ['message templates', 'whatsapp/test_messages.js'],
    ['trigger gate (/hey)', 'whatsapp/test_trigger_gate.js'],
    ['prompt scope', 'whatsapp/test_prompt_scope.js'],
    ['local SLM fallback', 'whatsapp/test_local_slm.js'],
    ['location memory', 'whatsapp/test_location_memory.js'],
    ['cloud bridge', 'whatsapp/test_dukan_cloud.js'],
    ['order owner stamping', 'whatsapp/test_shop_owner_stamping.js'],
    ['final order state', 'whatsapp/test_final_order_state.js'],
    ['pipeline e2e', 'whatsapp/test_pipeline_e2e.js'],
    ['pipeline reliability (500 runs)', 'whatsapp/test_pipeline_reliability.js'],
    ['suite hermeticity', 'whatsapp/test_suite_hermeticity.js'],
    ['client API transport + 401 recovery', 'scripts/test_api_client_auth.js'],
    ['locale coverage', 'scripts/test_locale_usage.js'],
    ['env contract', 'scripts/test_env_contract.js'],
    ['no key in the bundle', 'scripts/test_no_key_in_bundle.js'],
  ];

  await check(LOGIC, `all ${suites.length} module suites pass`, async () => {
    const failures = [];
    const done = [];
    for (const [label, file] of suites) {
      try {
        runSuite(label, file);
        done.push(label);
      } catch (e) {
        failures.push(e.message);
      }
    }
    assert(failures.length === 0, `${failures.length} suite(s) failed → ${failures.join(' || ')}`);
    return `${done.length}/${suites.length} suites green`;
  }, { hint: 'the alert above names the exact module that regressed', curl: 'npm test' });

  if (FULL) {
    await check(LOGIC, 'the full frontend + MCP suite (`npm test`) passes', async () => {
      const out = spawnSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      assert(out.status === 0, `npm test exited ${out.status}`);
      return 'npm test green';
    }, { hint: 'a schema, MCP or UI contract test broke', curl: 'npm test' });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SURFACE — the bot's public HTTP surface, with curl.
// ════════════════════════════════════════════════════════════════════════════
const SURFACE = 'surface';

let publicStatus = null;

if (!NETWORK) {
  skip(SURFACE, 'public surface', OFFLINE ? 'skipped: --offline' : 'skipped: no API base configured');
} else if (!HAS_CURL) {
  skip(SURFACE, 'public surface', 'skipped: curl not installed');
} else {
  await check(SURFACE, 'the tunnel answers the public health check', async () => {
    const r = curlProbe(`${API_BASE}/api/status`);
    assert(r.code === 200, `HTTP ${r.code} — the tunnel or the bot is down`);
    const body = JSON.parse(r.text);
    publicStatus = body;
    assert(typeof body.status === 'string', `no status field: ${short(r.text, 80)}`);
    return `status="${body.status}"`;
  }, { hint: 'the bot on the laptop is not running, or ngrok is down', curl: `curl -s ${API_BASE}/api/status` });

  await check(SURFACE, 'the WhatsApp session is paired', async () => {
    assert(publicStatus, 'the health check did not answer');
    assert(publicStatus.status === 'connected', `the bot reports "${publicStatus.status}" — customers are not being answered`);
    return 'connected';
  }, { hint: 'the phone unlinked, or auth_info was lost; re-pair from Settings → WhatsApp', curl: `curl -s ${API_BASE}/api/status | grep connected` });

  await check(SURFACE, 'the POS shell is served', async () => {
    const r = curlProbe(`${API_BASE}/`);
    assert(r.code === 200, `HTTP ${r.code}`);
    assert(/<div id="root"|<script/.test(r.text), 'the response is not the app shell');
    assert(/\/assets\/.+\.js/.test(r.text), 'the shell references no bundle');
    return 'shell + bundle reference';
  }, { hint: 'dist is missing on the bot box, or installPosRoutes is not mounted', curl: `curl -s ${API_BASE}/ | head -20` });

  const shell = HAS_CURL ? curlProbe(`${API_BASE}/`) : null;
  const assets = shell ? [...String(shell.text).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]) : [];

  await check(SURFACE, 'every asset the shell references is served', async () => {
    assert(assets.length > 0, 'the shell referenced no /assets/ file to check');
    for (const a of assets) {
      const r = curlProbe(`${API_BASE}${a}`);
      assert(r.code === 200, `${a} → HTTP ${r.code}`);
      if (a.endsWith('.js')) assert(/javascript/.test(r.contentType), `${a} served as ${r.contentType}`);
      if (a.endsWith('.css')) assert(/text\/css/.test(r.contentType), `${a} served as ${r.contentType}`);
    }
    return `${assets.length} assets 200`;
  }, { hint: 'the box is serving a dist that does not match its index.html', curl: `curl -sI ${API_BASE}/assets/index-CHG03XOE.js` });

  await check(SURFACE, 'the PWA manifest and icons are served', async () => {
    const mf = curlProbe(`${API_BASE}/site.webmanifest`);
    assert(mf.code === 200, `site.webmanifest → HTTP ${mf.code}`);
    assert(/json/.test(mf.contentType), `site.webmanifest served as ${mf.contentType}`);
    JSON.parse(mf.text);
    for (const icon of ['/icon-192.png', '/favicon.ico']) {
      const r = curlProbe(`${API_BASE}${icon}`);
      assert(r.code === 200, `${icon} → HTTP ${r.code}`);
    }
    return 'manifest + icons';
  }, { hint: 'installability and the app icon are broken', curl: `curl -sI ${API_BASE}/site.webmanifest` });

  await check(SURFACE, 'a MISSING asset is a 404, never HTML with a 200', async () => {
    const r = curlProbe(`${API_BASE}/assets/index-STALE0000.js`);
    assert(r.code === 404, `HTTP ${r.code} — a stale bundle hash is being answered with the app shell`);
    assert(!/html/i.test(r.contentType), `served as ${r.contentType}: the browser dies on "Unexpected token <"`);
    return '404, non-HTML';
  }, {
    hint: 'whatsapp/posStatic.js is handing every unmatched path to index.html; a redeploy then breaks every open tab',
    curl: `curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/assets/nope.js`,
  });

  await check(SURFACE, 'files that do not exist are not answered with the app shell', async () => {
    const offenders = [];
    for (const p of ['/manifest.json', '/sw.js', '/i18n/locales/zz.json']) {
      const r = curlProbe(`${API_BASE}${p}`);
      // Either genuinely present (and typed correctly) or a clean 404. HTML is never right.
      if (r.code === 200) {
        if (/html/i.test(r.contentType)) offenders.push(`${p} → 200 text/html`);
      } else if (r.code !== 404) {
        offenders.push(`${p} → HTTP ${r.code}`);
      }
    }
    assert(offenders.length === 0, offenders.join(', '));
    return 'absent files 404, present files typed';
  }, { hint: 'the SPA fallback is answering file paths', curl: `curl -sI ${API_BASE}/sw.js` });

  await check(SURFACE, 'an unknown /api path never returns HTML', async () => {
    const r = curlProbe(`${API_BASE}/api/definitely-not-a-route`);
    assert(r.code !== 200, `HTTP ${r.code} — an unknown API path must not succeed`);
    assert(!/html/i.test(r.contentType), `served as ${r.contentType}; a JSON client would throw a parse error`);
    return `HTTP ${r.code} ${r.contentType || '(no type)'}`;
  }, { hint: 'a mistyped endpoint is being answered by the POS mount', curl: `curl -sI ${API_BASE}/api/nope` });

  await check(SURFACE, 'the legacy ops console stays off', async () => {
    const r = curlProbe(`${API_BASE}/ops`);
    assert(r.code === 404, `HTTP ${r.code} — the ops console can re-pair the WhatsApp session and must stay closed`);
    return '404';
  }, { hint: 'ENABLE_OPS_CONSOLE was set to 1 on the box', curl: `curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/ops` });

  await check(SURFACE, 'every protected route refuses an anonymous caller', async () => {
    const routes = ['/api/qr', '/api/dukan/orders', '/api/dukan/stats', '/api/dukan/catalog', '/api/chats', '/api/webhook', '/events'];
    const wrong = [];
    for (const route of routes) {
      const r = curlProbe(`${API_BASE}${route}`);
      if (r.code !== 401) wrong.push(`${route} → ${r.code} (want 401)`);
    }
    assert(wrong.length === 0, wrong.join(', '));
    return `${routes.length} routes 401 without a token`;
  }, { hint: 'the auth middleware is not mounted before the routes, or a route is public by mistake', curl: `curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/dukan/orders` });

  await check(SURFACE, 'a forged token is refused', async () => {
    const r = curlProbe(`${API_BASE}/api/dukan/orders`, { headers: { Authorization: 'Bearer not-a-real-token' } });
    assert(r.code === 401, `HTTP ${r.code} — a garbage token must not be accepted`);
    return '401';
  }, { hint: 'token verification is failing open — this is the worst possible bug', curl: `curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer nope' ${API_BASE}/api/dukan/orders` });
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH — the trust boundary, with a throwaway account.
// ════════════════════════════════════════════════════════════════════════════
const AUTH = 'auth';

const probeUser = { email: `v2-probe-${Date.now()}@example.com`, password: 'V2Probe!9821', id: '', token: '' };
let authReady = false;

if (!NETWORK || !SUPA_URL || !SUPA_SERVICE || !SUPA_ANON) {
  skip(AUTH, 'authenticated boundary', OFFLINE ? 'skipped: --offline' : 'skipped: Supabase url/service/anon key missing from .env');
} else {
  await check(AUTH, 'a probe account can be created (proves the service key works)', async () => {
    const r = await httpProbe(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, 'Content-Type': 'application/json' },
      body: { email: probeUser.email, password: probeUser.password, email_confirm: true },
    });
    assert(r.status === 200, `admin user create answered HTTP ${r.status}: ${short(r.text, 120)}`);
    probeUser.id = String(jsonOf(r, 'admin users').id || '');
    assert(probeUser.id, 'the created user has no id');
    cleanup.push(async () => {
      await httpProbe(`${SUPA_URL}/auth/v1/admin/users/${probeUser.id}`, {
        method: 'DELETE',
        headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` },
      }).catch(() => {});
    });
    return `probe account ${probeUser.id.slice(0, 8)}…`;
  }, { hint: 'the service key is rotated, revoked, or belongs to another project — the bot cannot verify anyone', curl: `curl -s -o /dev/null -w '%{http_code}' -X POST ${SUPA_URL}/auth/v1/admin/users -H 'apikey: $SUPABASE_SERVICE_KEY'` });

  await check(AUTH, 'the probe account can sign in with the app anon key', async () => {
    assert(probeUser.id, 'no probe account was created');
    const r = await httpProbe(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPA_ANON, 'Content-Type': 'application/json' },
      body: { email: probeUser.email, password: probeUser.password },
    });
    assert(r.status === 200, `sign in answered HTTP ${r.status}: ${short(r.text, 120)}`);
    probeUser.token = String(jsonOf(r, 'token').access_token || '');
    assert(probeUser.token, 'no access_token in the response');
    authReady = true;
    return 'access token issued';
  }, { hint: 'the anon key in the app is not this project\'s, or the project has email confirmation forced', curl: `curl -s -X POST '${SUPA_URL}/auth/v1/token?grant_type=password' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -d '{"email":"…","password":"…"}'` });

  if (!authReady) {
    skip(AUTH, 'the rest of the authenticated checks', 'no access token, so nothing downstream can run');
  } else {
    const authed = (route, opts = {}) =>
      httpProbe(`${API_BASE}${route}`, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${probeUser.token}` } });

    await check(AUTH, 'the bot accepts a real token and returns this shop\'s orders', async () => {
      const r = await authed('/api/dukan/orders');
      assert(r.status === 200, `HTTP ${r.status} — this is exactly the "everything 401" failure`);
      const body = jsonOf(r, 'orders');
      assert(Array.isArray(body.orders), 'the response has no orders array');
      return `HTTP 200, ${body.orders.length} order(s) for a fresh account`;
    }, { hint: 'the bot\'s SUPABASE_SERVICE_KEY cannot verify this project\'s tokens', curl: `curl -s -H 'Authorization: Bearer <token>' ${API_BASE}/api/dukan/orders` });

    await check(AUTH, 'the stats route answers for this shop', async () => {
      const r = await authed('/api/dukan/stats');
      assert(r.status === 200, `HTTP ${r.status}`);
      const body = jsonOf(r, 'stats');
      assert(typeof body.totalOrders === 'number', `totalOrders is ${typeof body.totalOrders}`);
      return `totalOrders=${body.totalOrders}`;
    }, { hint: 'the stats route or its scoping broke', curl: `curl -s -H 'Authorization: Bearer <token>' ${API_BASE}/api/dukan/stats` });

    await check(AUTH, 'the catalog route answers for this shop', async () => {
      const r = await authed('/api/dukan/catalog');
      assert(r.status === 200, `HTTP ${r.status}`);
      return 'HTTP 200';
    }, { hint: 'the catalog read or its scoping broke', curl: `curl -s -H 'Authorization: Bearer <token>' ${API_BASE}/api/dukan/catalog` });

    await check(AUTH, 'the QR route answers (WhatsApp linking)', async () => {
      const r = await authed('/api/qr');
      assert(r.status === 200, `HTTP ${r.status}`);
      jsonOf(r, 'qr');
      return 'HTTP 200';
    }, { hint: 'the linking screen cannot show a QR', curl: `curl -s -H 'Authorization: Bearer <token>' ${API_BASE}/api/qr` });

    await check(AUTH, 'the live event stream opens with a token', async () => {
      const ctrl = new AbortController();
      const res = await withTimeout(
        realFetch(`${API_BASE}/events`, { headers: { ...SOCK, Authorization: `Bearer ${probeUser.token}` }, signal: ctrl.signal }),
        15000,
        'GET /events',
      );
      assert(res.status === 200, `HTTP ${res.status}`);
      assert(/text\/event-stream/.test(res.headers.get('content-type') || ''), `content-type ${res.headers.get('content-type')}`);
      const reader = res.body.getReader();
      const first = await withTimeout(reader.read(), 15000, 'first SSE frame');
      ctrl.abort();
      assert(first.value && first.value.length > 0, 'the stream opened but sent no frame');
      return `${first.value.length} bytes on the first frame`;
    }, { hint: 'order popups and live status are dead even though polling works', curl: `curl -sN -H 'Authorization: Bearer <token>' ${API_BASE}/events` });

    await check(AUTH, 'an operator-only route refuses a plain shopkeeper', async () => {
      const r = await authed('/api/chats');
      assert(r.status === 403, `HTTP ${r.status} — a normal account must get 403, not the shared WhatsApp chat list`);
      return '403';
    }, { hint: 'the operator allowlist is empty AND the policy is not enforced, or the route moved out of OPERATOR', curl: `curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer <token>' ${API_BASE}/api/chats` });

    await check(AUTH, '`?scope=all` does not widen a plain shopkeeper\'s view', async () => {
      const r = await authed('/api/dukan/orders?scope=all');
      assert(r.status === 200, `HTTP ${r.status}`);
      const body = jsonOf(r, 'orders?scope=all');
      assert(Array.isArray(body.orders), 'no orders array');
      assert(body.orders.length === 0, `a fresh non-operator account saw ${body.orders.length} order(s) — cross-shop leak`);
      return 'still scoped to its own (empty) list';
    }, { hint: 'ordersQueryFor is honouring scope=all for a non-operator: one shop can read another', curl: `curl -s -H 'Authorization: Bearer <token>' '${API_BASE}/api/dukan/orders?scope=all'` });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AI — the path insights and onboarding actually call.
// ════════════════════════════════════════════════════════════════════════════
const AI = 'ai';

if (!NETWORK || !authReady) {
  skip(AI, 'model proxy', OFFLINE ? 'skipped: --offline' : 'skipped: no access token');
} else {
  const aiHeaders = { Authorization: `Bearer ${probeUser.token}`, 'Content-Type': 'application/json' };

  await check(AI, 'the AI proxy answers a non-streamed completion', async () => {
    const started = Date.now();
    const r = await httpProbe(`${API_BASE}/api/ai/chat/completions`, {
      method: 'POST',
      headers: aiHeaders,
      body: { messages: [{ role: 'user', content: 'Reply with the single word: ok' }] },
      timeout: 90000,
    });
    assert(r.status === 200, `HTTP ${r.status}: ${short(r.text, 160)}`);
    const body = jsonOf(r, 'completion');
    const content = body?.choices?.[0]?.message?.content;
    assert(typeof content === 'string' && content.trim().length > 0, 'the model returned no content');
    return `${ms(Date.now() - started)} · ${body.model || 'unknown model'} · "${short(content, 40)}"`;
  }, {
    hint: 'a 401 here means the TOKEN was refused (sign in again), a 5xx means the provider/key (OPENROUTER_API_KEY), never the app',
    curl: `curl -s -X POST ${API_BASE}/api/ai/chat/completions -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"say ok"}]}'`,
  });

  await check(AI, 'the AI proxy streams (insights depend on SSE)', async () => {
    const ctrl = new AbortController();
    const res = await withTimeout(
      realFetch(`${API_BASE}/api/ai/chat/completions`, {
        method: 'POST',
        headers: { ...SOCK, ...aiHeaders, Accept: 'text/event-stream' },
        body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'say ok' }] }),
        signal: ctrl.signal,
      }),
      90000,
      'POST /api/ai/chat/completions (stream)',
    );
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(/event-stream/.test(res.headers.get('content-type') || ''), `content-type ${res.headers.get('content-type')}`);
    assert(res.body, 'no response body to stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let frames = 0;
    let sawContent = false;
    const deadline = Date.now() + 45000;
    while (!sawContent && Date.now() < deadline) {
      const { value, done } = await withTimeout(reader.read(), 45000, 'SSE chunk');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        frames++;
        try {
          if (JSON.parse(payload)?.choices?.[0]?.delta?.content) sawContent = true;
        } catch {
          /* a keep-alive or a partial frame */
        }
      }
    }
    ctrl.abort();
    assert(frames > 0, 'the stream sent no SSE frames');
    assert(sawContent, `${frames} frame(s), none carried content — insights would show an error card`);
    return `${frames} frame(s), content received`;
  }, {
    hint: 'insights and onboarding stream through this; a 401 is the session, an empty stream is the provider',
    curl: `curl -sN -X POST ${API_BASE}/api/ai/chat/completions -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"stream":true,"messages":[{"role":"user","content":"say ok"}]}'`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ORDERS — the routes, without touching a live order.
// ════════════════════════════════════════════════════════════════════════════
const ORDERS = 'orders';

if (!NETWORK || !authReady) {
  skip(ORDERS, 'order routes', OFFLINE ? 'skipped: --offline' : 'skipped: no access token');
} else {
  const actions = ['accept', 'ready', 'delivered', 'reject'];
  await check(ORDERS, 'each order action route exists and is mounted', async () => {
    const wrong = [];
    for (const action of actions) {
      const r = await httpProbe(`${API_BASE}/api/dukan/orders/DKN-000000/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${probeUser.token}`, 'Content-Type': 'application/json' },
        body: {},
      });
      // 404 = mounted and correctly refusing an unknown id. 405/500 = the route or a handler is broken.
      if (r.status !== 404) wrong.push(`${action} → HTTP ${r.status}`);
    }
    assert(wrong.length === 0, wrong.join(', '));
    return `${actions.length} routes answer 404 for an unknown order`;
  }, {
    hint: 'a 405 means the route is missing on the box, a 500 means the handler throws',
    curl: `curl -s -o /dev/null -w '%{http_code}' -X POST ${API_BASE}/api/dukan/orders/DKN-0/accept -H 'Authorization: Bearer <token>'`,
  });

  await check(ORDERS, 'the WhatsApp → dashboard order bridge is reachable', async () => {
    // Both halves of the bridge, without inventing an order: the bot's engine
    // list and the Supabase table the app reads.
    const local = await httpProbe(`${API_BASE}/api/dukan/orders`, { headers: { Authorization: `Bearer ${probeUser.token}`, ...SOCK } });
    assert(local.status === 200, `engine list answered HTTP ${local.status}`);
    const cloud = await httpProbe(`${SUPA_URL}/rest/v1/orders?select=external_id&limit=1`, {
      headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` },
    });
    assert(cloud.status === 200, `Supabase orders table answered HTTP ${cloud.status} — the mirror has nowhere to land`);
    assert(Array.isArray(jsonOf(cloud, 'orders table')), 'the orders table is not readable');
    return 'engine + cloud table both reachable';
  }, {
    hint: 'orders can be created but never mirrored, so the dashboard stays empty',
    curl: `curl -s '${SUPA_URL}/rest/v1/orders?select=external_id&limit=1' -H 'apikey: $SUPABASE_SERVICE_KEY'`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MCP — where MCP orders come from.
// ════════════════════════════════════════════════════════════════════════════
const MCP = 'mcp';

if (!MCP_URL || OFFLINE) {
  skip(MCP, 'MCP surface', OFFLINE ? 'skipped: --offline' : 'skipped: VITE_MCP_URL is not set in vercel.json');
} else {
  await check(MCP, 'the MCP health check is green and its Supabase key works', async () => {
    const r = HAS_CURL ? curlProbe(`${MCP_ORIGIN}/health`) : await httpProbe(`${MCP_ORIGIN}/health`);
    const status = r.code ?? r.status;
    assert(status === 200, `HTTP ${status}`);
    const body = JSON.parse(r.text);
    assert(body.ok === true, `ok=${body.ok}`);
    assert(body.supabaseKey === 'ok', `supabaseKey=${body.supabaseKey} — the MCP cannot read shops`);
    assert(body.enabled === true, 'ordering is switched off for every shop');
    return `${body.service} · auth=${body.auth} · supabaseKey=${body.supabaseKey}`;
  }, { hint: 'the MCP function is up but cannot reach Supabase, so every MCP order fails', curl: `curl -s ${MCP_ORIGIN}/health` });

  await check(MCP, 'MCP discovery names the resource and the authorization server', async () => {
    const r = HAS_CURL
      ? curlProbe(`${MCP_ORIGIN}/.well-known/oauth-protected-resource`)
      : await httpProbe(`${MCP_ORIGIN}/.well-known/oauth-protected-resource`);
    const status = r.code ?? r.status;
    assert(status === 200, `HTTP ${status}`);
    const body = JSON.parse(r.text);
    assert(String(body.resource || '').endsWith('/mcp'), `resource=${body.resource}`);
    assert(Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0, 'no authorization server advertised');
    const ref = projectRef(body.authorization_servers[0]);
    if (projectRef(SUPA_URL)) assert(ref === projectRef(SUPA_URL), `discovery points at ${ref}, the app signs in to ${projectRef(SUPA_URL)}`);
    return `${body.resource} → ${body.authorization_servers[0]}`;
  }, { hint: 'a client that connects today cannot discover how to authenticate', curl: `curl -s ${MCP_ORIGIN}/.well-known/oauth-protected-resource` });

  await check(MCP, 'an anonymous MCP call gets an RFC 9728 challenge', async () => {
    const res = await httpProbe(`${MCP_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    });
    assert(res.status === 401, `HTTP ${res.status}`);
    const challenge = res.headers.get('www-authenticate') || '';
    assert(/Bearer/i.test(challenge), `no Bearer challenge (www-authenticate: "${challenge}")`);
    assert(/resource_metadata/.test(challenge), 'the challenge carries no resource_metadata, so a client cannot find discovery');
    return short(challenge, 90);
  }, { hint: 'MCP clients cannot start the OAuth flow and report "unauthorized" forever', curl: `curl -s -o /dev/null -D - -X POST ${MCP_URL}` });

  if (!authReady) {
    skip(MCP, 'authenticated MCP calls', 'no access token');
  } else {
    /** The version the server accepts in `MCP-Protocol-Version`. */
    let mcpVersion = '';
    let negotiated = '';
    let sessionId = '';

    const mcpCall = async (method, params, extraHeaders = {}, id = 2) => {
      const res = await httpProbe(MCP_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${probeUser.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(mcpVersion ? { 'MCP-Protocol-Version': mcpVersion } : {}),
          ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
          ...extraHeaders,
        },
        body: { jsonrpc: '2.0', id, method, params },
      });
      const parse = () => {
        const text = res.text.trim();
        if (text.startsWith('{')) return JSON.parse(text);
        const line = text.split('\n').find((l) => l.startsWith('data:'));
        return line ? JSON.parse(line.slice(5).trim()) : null;
      };
      return { res, body: parse(), session: res.headers.get('mcp-session-id') || '' };
    };

    /**
     * A method call that honours the server's own version advertisement.
     *
     * The SDK's `initialize` answers with its default negotiated version, but
     * validates `MCP-Protocol-Version` against the list it actually supports, so
     * the two can disagree. A real client follows `error.data.supported` — this
     * does the same, once, instead of reporting a version quirk as a broken tool
     * catalogue.
     */
    const callWithVersion = async (method, id) => {
      // The header and the body envelope must name the SAME version, or the
      // server rejects the pair (-32020) even when both are individually valid.
      const once = () =>
        mcpCall(
          method,
          { _meta: { 'io.modelcontextprotocol/protocolVersion': mcpVersion, 'io.modelcontextprotocol/clientCapabilities': {} } },
          { 'Mcp-Method': method },
          id,
        );
      let out = await once();
      const supported = out.body?.error?.data?.supported;
      if (out.res.status === 400 && Array.isArray(supported) && supported[0] && supported[0] !== mcpVersion) {
        mcpVersion = supported[0];
        out = await once();
      }
      return out;
    };

    await check(MCP, 'an authenticated client can initialize the MCP server', async () => {
      const { res, body, session } = await mcpCall('initialize', {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'dukaan-stress-v2', version: '2.0.0' },
      }, {}, 1);
      assert(res.status === 200, `HTTP ${res.status}: ${short(res.text, 140)}`);
      assert(body?.result?.serverInfo?.name, `no serverInfo: ${short(res.text, 140)}`);
      negotiated = body.result.protocolVersion || '2026-07-28';
      mcpVersion = negotiated;
      sessionId = session;
      return `${body.result.serverInfo.name} · negotiated ${negotiated}${sessionId ? ' · session' : ''}`;
    }, {
      hint: 'a valid Supabase token is rejected by the MCP verifier, or the function throws',
      curl: `curl -s -X POST ${MCP_URL} -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`,
    });

    if (!negotiated) {
      skip(MCP, 'the tool catalogue', 'initialize did not succeed');
    } else {
      await check(MCP, 'the ordering tools are registered and listable', async () => {
        const { res, body } = await callWithVersion('tools/list', 2);
        assert(res.status === 200, `HTTP ${res.status}: ${short(res.text, 140)}`);
        const tools = body?.result?.tools;
        assert(Array.isArray(tools) && tools.length > 0, 'no tools returned');
        const names = tools.map((t) => t.name);
        const wanted = ['find_shops', 'search_products', 'quote_order', 'place_order', 'get_order', 'cancel_order'];
        const missing = wanted.filter((n) => !names.includes(n));
        assert(missing.length === 0, `missing tool(s): ${missing.join(', ')} (have ${names.length})`);
        const note = mcpVersion === negotiated ? '' : ` · server accepts ${mcpVersion} (initialize said ${negotiated})`;
        return `${names.length} tools · ordering flow complete${note}`;
      }, { hint: 'an AI assistant connected over MCP can no longer place an order', curl: `curl -s -X POST ${MCP_URL} -H 'Authorization: Bearer <token>' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'` });

      await check(MCP, 'the checkout card resource is registered', async () => {
        const { res, body } = await callWithVersion('resources/list', 3);
        assert(res.status === 200, `HTTP ${res.status}: ${short(res.text, 140)}`);
        const list = body?.result?.resources || [];
        assert(list.some((r) => String(r.uri).includes('checkout')), `no checkout resource in ${list.length} resource(s)`);
        return `${list.length} resource(s), checkout card present`;
      }, { hint: 'the MCP App checkout UI will not render for clients', curl: `curl -s -X POST ${MCP_URL} -H 'Authorization: Bearer <token>' -d '{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}'` });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POS — the deployed app, and whether it may talk to the bot at all.
// ════════════════════════════════════════════════════════════════════════════
const POS = 'pos';

if (!POS_URL || !NETWORK) {
  skip(POS, 'deployed POS', OFFLINE ? 'skipped: --offline' : 'skipped: no POS url configured');
} else {
  let posOrigin = '';

  await check(POS, 'the deployed app serves its shell', async () => {
    const r = await httpProbe(POS_URL, {});
    assert(r.status === 200, `HTTP ${r.status}`);
    assert(/<div id="root"|<script/.test(r.text), 'not the app shell');
    posOrigin = new URL(r.url || POS_URL).origin;
    return `${posOrigin} · HTTP 200`;
  }, { hint: 'the Vercel deployment is down or serving a 404 rewrite', curl: `curl -sI ${POS_URL}` });

  await check(POS, 'the deployed bundle knows where the bot is', async () => {
    const r = await httpProbe(POS_URL, {});
    const html = r.text;
    const srcs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
    assert(srcs.length > 0, 'the shell loads no bundle');
    const host = API_BASE.replace(/^https?:\/\//, '');
    let sawBackend = false;
    let sawSupabase = false;
    for (const src of srcs) {
      const bundle = await httpProbe(new URL(src, r.url || POS_URL).toString(), {});
      if (bundle.status !== 200) continue;
      if (bundle.text.includes(host)) sawBackend = true;
      if (/supabase\.co/.test(bundle.text)) sawSupabase = true;
    }
    assert(sawBackend, `no bundle references the bot (${host}) — an old build is deployed`);
    assert(sawSupabase, 'no bundle carries a Supabase URL — sign in cannot work');
    return `bundle references the bot and Supabase`;
  }, { hint: 'Vercel is serving a build older than vercel.json\'s VITE_API_BASE', curl: `curl -s ${POS_URL} | grep -o '/assets/[^"]*\\.js'` });

  await check(POS, 'the browser preflight from the app origin is allowed', async () => {
    const origin = posOrigin || new URL(POS_URL).origin;
    const r = await httpProbe(`${API_BASE}/api/ai/chat/completions`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert([200, 204].includes(r.status), `preflight answered HTTP ${r.status}`);
    const allow = r.headers.get('access-control-allow-origin') || '';
    assert(allow === origin || allow === '*', `the bot refuses ${origin} (allow-origin: "${allow}")`);
    return `allow-origin ${allow}`;
  }, { hint: 'corsPolicy.js does not list this origin, so every browser call fails before it is sent', curl: `curl -s -o /dev/null -D - -X OPTIONS ${API_BASE}/api/ai/chat/completions -H 'Origin: ${POS_URL}'` });

  await check(POS, 'an origin the app does not own is refused', async () => {
    const r = await httpProbe(`${API_BASE}/api/ai/chat/completions`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    const allow = r.headers.get('access-control-allow-origin');
    assert(!allow || allow === 'null', `the bot answers any origin ("${allow}") — any website can read a shop's orders`);
    return 'no allow-origin for a foreign origin';
  }, { hint: 'the CORS allowlist fell back to wildcard', curl: `curl -s -o /dev/null -D - -X OPTIONS ${API_BASE}/api/ai/chat/completions -H 'Origin: https://evil.example'` });
}

// ════════════════════════════════════════════════════════════════════════════
// teardown + report
// ════════════════════════════════════════════════════════════════════════════
for (const step of cleanup) {
  try {
    await step();
  } catch {
    /* best effort: a leftover probe account is not a product failure */
  }
}
try {
  fs.rmSync(BODY_FILE, { force: true });
} catch {
  /* nothing to remove */
}

const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'SKIP');
const clear = results.filter((r) => r.status === 'CLEAR');

console.log('\n' + '─'.repeat(WIDTH));
let section = null;
for (const r of results) {
  if (r.section !== section) {
    section = r.section;
    console.log(`\n  ${String(section).toUpperCase()}`);
  }
  const mark = r.status === 'CLEAR' ? 'CLEAR' : r.status === 'FAIL' ? ' FAIL' : ' SKIP';
  console.log(`  [${mark}] ${String(r.id).padStart(2)}. ${r.name}`);
  if (r.detail) console.log(`           ${r.detail}`);
}
console.log('\n' + '─'.repeat(WIDTH));
console.log(`  ${clear.length} clear, ${failed.length} failed, ${skipped.length} skipped  (${results.length} checkpoints)`);

if (failed.length === 0) {
  console.log('  RESULT: EVERY LAYER OK');
  console.log('═'.repeat(WIDTH) + '\n');
  process.exit(0);
}

// The point of v2: say WHICH layer, WHAT it means, and HOW to see it again.
console.log('\n' + '═'.repeat(WIDTH));
console.log(`  DIAGNOSIS — ${failed.length} failure(s)`);
console.log('═'.repeat(WIDTH));
const bySection = new Map();
for (const f of failed) {
  if (!bySection.has(f.section)) bySection.set(f.section, []);
  bySection.get(f.section).push(f);
}
const SECTION_MEANING = {
  config: 'this machine would deploy something broken — fix the files before touching the server',
  logic: 'the CODE is broken; the deployed box is irrelevant until these pass',
  surface: 'the bot is up but serving the wrong thing — check whatsapp/server.js and posStatic.js on the box',
  auth: 'the trust boundary is broken: either the bot cannot verify tokens, or it lets the wrong ones through',
  ai: 'the model path is broken — the app is fine, the provider or the token is not',
  orders: 'orders can be created but not read back, so the dashboard stays empty',
  mcp: 'the MCP surface is broken — AI-assistant ordering and its orders',
  pos: 'the browser and the bot disagree about who may call whom',
};
for (const [section, items] of bySection) {
  console.log(`\n  ▸ ${String(section).toUpperCase()} — ${SECTION_MEANING[section] || ''}`);
  for (const f of items) {
    console.log(`\n    ✗ ${f.name}`);
    console.log(`      got:       ${f.detail}`);
    if (f.hint) console.log(`      means:     ${f.hint}`);
    if (f.curl) console.log(`      reproduce: ${f.curl}`);
  }
}
console.log('\n' + '─'.repeat(WIDTH));
console.log('  Order of work: config → logic → surface → auth → ai → orders → mcp → pos.');
console.log('  A red CONFIG or LOGIC check explains the red ones below it: fix top-down.');
if (skipped.length) {
  console.log('\n  Not checked here (SKIP):');
  for (const s of skipped) console.log(`    · ${s.name} — ${s.detail}`);
}
console.log('═'.repeat(WIDTH) + '\n');

process.exit(1);
