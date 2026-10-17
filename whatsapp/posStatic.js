import express from 'express';
import path from 'path';
import fs from 'fs';

// Paths the POS mount must never answer. Without this the SPA fallback would
// return index.html with a 200 for a mistyped API call, and a client that parses
// the body would see an HTML parse error instead of a status it can act on.
// Express matches routes case-insensitively, so the comparison below must be too.
const RESERVED_PREFIXES = ['/api', '/ops'];
const RESERVED_EXACT = ['/events'];

const isReserved = (p) => {
  const lower = p.toLowerCase();
  return (
    RESERVED_EXACT.includes(lower) ||
    RESERVED_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))
  );
};

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
  // An unmatched API path answers JSON. Reserved paths never reach the SPA
  // fallback below, so without this they would fall to Express's default HTML
  // 404 and a client parsing the body would see a parse error instead of a
  // status it can act on.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });

  // A mistyped ops URL must not be handed the POS shell either.
  app.use('/ops', (req, res) => {
    res.status(404).send('Not found');
  });

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
