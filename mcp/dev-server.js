import http from 'node:http';
import { readConfig, requireConfig, connectUrlFor } from './config.js';
import { createFetchHandler } from './server.js';
import { toWebRequest, sendWebResponse } from './nodeAdapter.js';

/**
 * Local MCP server. The OAuth issuer is Supabase, so a real token is required
 * for tool calls; health and discovery work without one.
 *
 *   npm run mcp:dev
 *   npx mcp-remote http://localhost:8787/mcp --allow-http
 */
const port = Number(process.env.MCP_PORT || 8787);
const config = readConfig();
config.publicUrl = config.publicUrl || 'http://localhost:8787/mcp';
config.documentationUrl = config.documentationUrl || connectUrlFor(config.publicUrl);
config.allowInsecure = config.publicUrl.startsWith('http://localhost') || config.publicUrl.startsWith('http://127.');

let handler;
try {
  requireConfig(config);
  handler = createFetchHandler(config);
} catch (error) {
  console.error(`[MCP] ${error.message}`);
  console.error('[MCP] Fill SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY in .env, then restart.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const request = toWebRequest(req);
    const response = await handler.fetch(request);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[MCP] local request failed', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(port, () => {
  console.log(`[MCP] listening on http://localhost:${port}`);
  console.log(`[MCP] endpoint   ${config.publicUrl}`);
  console.log(`[MCP] discovery  http://localhost:${port}/.well-known/oauth-protected-resource`);
});
