#!/usr/bin/env node
/**
 * Build-time secret guard.
 *
 * The backend used to have its provider key injected into the browser bundle by
 * `vite.config.ts`, so the live key was served to every visitor. The build now
 * fails if that class of mistake returns. Three independent checks:
 *
 *   1. no secret is parked in the VITE_ namespace — VITE_* is public by
 *      definition, so a key named VITE_*_API_KEY is a leak waiting to happen;
 *   2. no server-only value from `.env` appears anywhere under dist/;
 *   3. no key-shaped string and no hardcoded loopback backend appears in dist/
 *      or in any tracked file.
 *
 * Nothing here ever prints a secret value — only the variable name and the file
 * it was found in.
 *
 * Usage: node scripts/check-secrets.mjs [--env <file>] [--dist <dir>] [--quiet]
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const envFile = arg('--env', join(root, '.env'));
const distDir = arg('--dist', join(root, 'dist'));
const quiet = process.argv.includes('--quiet');

// Values declared public on purpose: they are designed to ship to browsers.
// (The anon key is only safe behind Row Level Security, which the schema sets.)
const PUBLIC_VALUES = new Set(['VITE_SUPABASE_ANON_KEY']);
const PUBLIC_NAMES = new Set(['VITE_SUPABASE_ANON_KEY']);

// Shapes that are always a leak inside the built bundle.
const FORBIDDEN_SHAPES = [
  { label: 'OpenRouter key', re: /sk-or-v1-[A-Za-z0-9]{20,}/ },
  { label: 'Groq key', re: /gsk_[A-Za-z0-9]{20,}/ },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // The hardcoded loopback backend that made every browser dial its own machine.
  // Both spellings: `localhost:8080` is the same failure as `127.0.0.1:8080`, and
  // a shopkeeper's browser has no model server to reach either way.
  { label: 'hardcoded loopback backend', re: /(?:127\.0\.0\.1|localhost):8080/ },
];

// In tracked files only the credential shapes matter. A local model server
// genuinely lives on loopback, so its address appears legitimately in the
// local-AI scripts, their tests and the docs; a hardcoded *bundle* URL is still
// caught by the dist scan above.
const TRACKED_SHAPES = FORBIDDEN_SHAPES.filter((s) => s.label !== 'hardcoded loopback backend');

const findings = [];
const add = (check, detail) => findings.push({ check, detail });

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.set(m[1], value);
  }
  return out;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const readText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

// ── 1 & 2: the .env contract and the dist scan ───────────────────────────────
if (!existsSync(envFile)) {
  if (!quiet) console.log(`(no env file at ${relative(root, envFile)} — skipping the value scan)`);
} else {
  const env = parseEnv(readText(envFile));

  // 1. a secret must not live in the public namespace
  for (const name of env.keys()) {
    if (/^VITE_/.test(name) && /(KEY|SECRET|TOKEN|PASSWORD)/i.test(name) && !PUBLIC_NAMES.has(name)) {
      add(
        'secret in the public VITE_ namespace',
        `${name} — rename it without the VITE_ prefix (VITE_* ships to every browser)`
      );
    }
  }

  // 2. no server-only value may appear under dist/
  const distFiles = walk(distDir);
  const secrets = [...env.entries()].filter(
    ([name, value]) =>
      value &&
      value.length >= 8 &&
      !PUBLIC_VALUES.has(name) &&
      /(KEY|SECRET|TOKEN|PASSWORD)/i.test(name)
  );

  for (const [name, value] of secrets) {
    for (const file of distFiles) {
      if (readText(file).includes(value)) {
        add('server-only value present in the bundle', `${name} → ${relative(root, file)}`);
        break;
      }
    }
  }
}

// ── 3: forbidden shapes in dist/ and in tracked files ────────────────────────
{
  const distFiles = walk(distDir);
  for (const file of distFiles) {
    const text = readText(file);
    for (const { label, re } of FORBIDDEN_SHAPES) {
      if (re.test(text)) add('forbidden shape in dist/', `${label} → ${relative(root, file)}`);
    }
  }

  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => join(root, f));
  } catch {
    // not a git checkout (e.g. a tarball) — the dist scan still ran
  }

  for (const file of tracked) {
    const text = readText(file);
    for (const { label, re } of TRACKED_SHAPES) {
      if (re.test(text)) add('forbidden shape in a tracked file', `${label} → ${relative(root, file)}`);
    }
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────
if (findings.length === 0) {
  if (!quiet) {
    console.log('✓ secret guard: no secret in the bundle, no key shape in dist/ or a tracked file');
  }
  process.exit(0);
}

console.error('\n✗ secret guard FAILED — the build must not ship this:\n');
for (const { check, detail } of findings) {
  console.error(`  [${check}] ${detail}`);
}
console.error(
  '\nRotate the exposed key in the provider dashboard, then fix the cause above.\n' +
    'Values are never printed here; the variable name and file are enough to find it.\n'
);
process.exit(1);
