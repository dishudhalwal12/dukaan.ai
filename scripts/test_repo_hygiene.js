import assert from 'assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/**
 * Repository hygiene.
 *
 * Two foot-guns live here. `npm run deploy` published the built bundle (which
 * once contained a live key) to a public gh-pages branch, and `vercel.json` once
 * rewrote every /api call to a VPS that no longer exists, which is why the
 * deployed site answered 502 on every request.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- RUNNING REPO HYGIENE TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// ── 1. no gh-pages publish path ──────────────────────────────────────────────
{
  assert.ok(!pkg.scripts.deploy, 'the gh-pages deploy script must be gone');
  assert.ok(!pkg.scripts.predeploy, 'a predeploy hook must not remain either');
  assert.ok(
    !(pkg.dependencies && pkg.dependencies['gh-pages']) && !(pkg.devDependencies && pkg.devDependencies['gh-pages']),
    'the gh-pages dependency must be gone with the script'
  );
  ok('no command publishes the built bundle to a public branch');
}

// ── 2. nothing secret or built is tracked ────────────────────────────────────
{
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const bad = tracked.filter((f) => f.startsWith('dist/') || f === '.env' || f.endsWith('/.env') || f.startsWith('whatsapp/auth_info/'));
  assert.deepStrictEqual(bad, [], `these must not be tracked: ${bad.join(', ')}`);
  ok('no build output, no .env and no WhatsApp session credentials are tracked');
}

// ── 3. the deployed site serves static files only ────────────────────────────
{
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.ok(!vercel.rewrites, 'vercel.json must not rewrite /api to a backend — that is what returned 502');
  assert.strictEqual(vercel.outputDirectory, 'dist', 'Vercel serves the built static site');
  ok('vercel.json serves the static build and proxies nothing');
}

// ── 4. the deployed bundle knows where the API lives ─────────────────────────
{
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const base = vercel.build && vercel.build.env && vercel.build.env.VITE_API_BASE;

  // Without this the browser calls /api on Vercel itself, which serves only
  // static files, so every request would fail against the deployed site — the
  // exact 502 the user saw. It is set here rather than in the dashboard so the
  // deploy cannot depend on a setting nobody can inspect from the repo.
  assert.ok(base, 'vercel.json must pin VITE_API_BASE so the deployed site can reach the API');
  assert.ok(/^https:\/\//.test(base), `VITE_API_BASE must be https, got ${base}`);
  assert.ok(
    !/\.vercel\.app/.test(base),
    'VITE_API_BASE must not point at Vercel itself — that origin serves no API'
  );
  ok('the deployed frontend is pinned to a real API origin');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} REPO HYGIENE TESTS PASSED 🎉`);
console.log('========================================');
