import { Readable } from 'node:stream';

/**
 * Convert a Node/Vercel request into a web Request and write a web Response
 * back, without buffering streaming (SSE) bodies.
 */
export function toWebRequest(req, { pathOverride } = {}) {
  const origin = `http://${req.headers?.host || 'localhost'}`;
  const raw = new URL(req.url || '/', origin);
  const path = pathOverride || raw.pathname;
  const url = new URL(path, origin);
  for (const [key, value] of raw.searchParams) {
    if (key !== '__route') url.searchParams.append(key, value);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }

  const method = String(req.method || 'GET').toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(req);
  return new Request(url, {
    method,
    headers,
    ...(body ? { body, duplex: 'half' } : {}),
  });
}

export async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }

  const stream = Readable.fromWeb(response.body);
  stream.on('error', (error) => {
    // A failing body used to be answered with res.destroy() unconditionally,
    // which the MCP client reports as "ECONNRESET: The socket connection was
    // closed unexpectedly" with no JSON-RPC error to act on. If nothing has been
    // written yet we can still answer honestly; only a half-sent response has
    // no valid continuation.
    const canStillAnswer = !res.headersSent && !res.writableEnded && !res.destroyed;
    if (!canStillAnswer) {
      res.destroy();
      return;
    }
    console.error('[MCP] response stream failed', { code: 'stream_error', message: String(error?.message || 'stream error') });
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'The response stream failed before it was sent.',
        data: { code: 'stream_error' },
      },
    }));
  });
  stream.pipe(res);
}
