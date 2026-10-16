#!/usr/bin/env node
// Production-posture stand-in for the Vercel edge.
//
// In production the browser talks to ONE origin (the Vercel deployment) and
// `vercel.json` rewrites /api/* and /events to the bot on the VPS. This file is
// that rewrite, locally: it serves dist/ and reverse-proxies the two backend
// prefixes, so the stress test exercises the real browser topology (root-absolute
// /api URLs resolving same-origin, SSE streaming through a proxy hop).
//
// It is NOT part of the deployed app — it only makes the local test honest.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const DIST = path.join(REPO, 'dist');
const BOT = new URL(process.env.BOT_URL || 'http://127.0.0.1:5101');
const PORT = Number(process.env.PROXY_PORT || 4180);

// Exactly the two prefixes vercel.json rewrites.
const PROXY_PREFIXES = ['/api', '/events'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function isProxied(url) {
  const pathname = url.split('?')[0];
  return PROXY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function proxy(req, res) {
  const upstream = http.request(
    {
      hostname: BOT.hostname,
      port: BOT.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: BOT.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      // pipe() (not buffering) is what keeps SSE a live stream.
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('proxy error');
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    pathname = '/';
  }
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, safe);
  if (!file.startsWith(DIST)) file = path.join(DIST, 'index.html');

  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    /* fall through to index.html */
  }
  if (!stat || stat.isDirectory()) file = path.join(DIST, 'index.html');

  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': body.length,
    });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  if (isProxied(req.url)) return proxy(req, res);
  return serveStatic(req, res);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`proxy: http://127.0.0.1:${PORT}  (static dist/ + /api,/events -> ${BOT.origin})`);
});
