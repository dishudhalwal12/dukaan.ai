import { readConfig, requireConfig } from '../mcp/config.js';
import { createFetchHandler } from '../mcp/server.js';
import { toWebRequest, sendWebResponse } from '../mcp/nodeAdapter.js';

/**
 * Vercel Node function for the public MCP endpoint.
 *
 * vercel.json rewrites:
 *   /mcp                                        -> /api/mcp?__route=mcp
 *   /.well-known/oauth-protected-resource        -> /api/mcp?__route=/.well-known/oauth-protected-resource
 *   /.well-known/oauth-protected-resource/mcp    -> /api/mcp?__route=/.well-known/oauth-protected-resource/mcp
 */
export const config = { maxDuration: 30 };

let cached;
function handler() {
  if (!cached) {
    const cfg = requireConfig(readConfig());
    cached = createFetchHandler(cfg);
  }
  return cached;
}

export default async function mcpFunction(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const rawRoute = req.query?.__route || requestUrl.searchParams.get('__route');
    const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
    const pathOverride = route ? String(route) : requestUrl.pathname.startsWith('/api/mcp') ? '/mcp' : undefined;
    const request = toWebRequest(req, { pathOverride });
    const response = await handler().fetch(request);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[MCP] function failed', { message: error?.message || 'unknown' });
    if (!res.headersSent) {
      res.statusCode = error?.message?.includes('not configured') ? 503 : 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
    }
    res.end(JSON.stringify({ error: 'mcp_unavailable' }));
  }
}
