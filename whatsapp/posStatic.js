import express from 'express';
import path from 'path';
import fs from 'fs';

// Paths the POS mount must never answer. Without this, the SPA fallback would
// return index.html for a mistyped API call, and a fetch() that expected JSON
// would fail with a parse error instead of a clean 404.
const RESERVED_PREFIXES = ['/api'];
const RESERVED_EXACT = ['/events'];

const isReserved = (p) =>
  RESERVED_EXACT.includes(p) ||
  RESERVED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

/**
 * Serves the built POS from the bot's own origin, so the browser talks to a
 * single origin for the app, /api and /events — no CORS, no reverse proxy, no
 * mixed content.
 *
 * Call this LAST, after every API route. express.static only answers for files
 * that exist, so real routes are never shadowed; unmatched GETs fall through to
 * index.html for client-side routing.
 *
 * @param {import('express').Express} app
 * @param {string} distDir absolute path to the Vite build (repo-root/dist)
 */
export function installPosRoutes(app, distDir) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.warn(
      `\n⚠️  POS build not found at ${distDir}/index.html — the app will NOT be served.\n` +
        '    Build it with `npm run build` at the repo root.\n'
    );
  }

  app.use(
    express.static(distDir, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Vite content-hashes these, so a year-long immutable cache is safe.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.basename(filePath) === 'index.html') {
          // The opposite of the assets: a cached index.html pins the app to
          // asset filenames that no longer exist after the next deploy.
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isReserved(req.path)) return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'), (err) => (err ? next() : undefined));
  });
}
