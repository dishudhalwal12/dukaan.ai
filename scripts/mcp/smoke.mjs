import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/**
 * Live smoke test against a deployed MCP endpoint.
 *
 *   MCP_SMOKE_URL=https://mcp.dukaan.ai/mcp \
 *   MCP_SMOKE_TOKEN=<supabase access token> \
 *   node scripts/mcp/smoke.mjs
 *
 * The token is a real Supabase user access token. Nothing is printed except
 * tool names and non-secret profile fields.
 */
const url = process.env.MCP_SMOKE_URL || '';
const token = process.env.MCP_SMOKE_TOKEN || '';
if (!url || !token) {
  console.error('Set MCP_SMOKE_URL and MCP_SMOKE_TOKEN to run the live smoke test.');
  process.exit(2);
}

const client = new Client({ name: 'dukaan-smoke', version: '1.0.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  authProvider: { token: async () => token },
});

try {
  await client.connect(transport);
  console.log(`✓ connected to ${url}`);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  for (const required of ['find_shops', 'search_products', 'quote_order', 'place_order', 'get_order']) {
    if (!names.includes(required)) throw new Error(`missing tool: ${required}`);
  }
  console.log(`✓ ${names.length} tools listed`);

  const profile = await client.callTool({ name: 'get_customer_profile', arguments: {} });
  if (profile.isError) throw new Error(profile.content?.[0]?.text || 'get_customer_profile failed');
  const addresses = profile.structuredContent?.addresses?.length || 0;
  console.log(`✓ profile readable; ${addresses} saved address(es)`);

  const pincode = process.env.MCP_SMOKE_PINCODE;
  if (pincode) {
    const shops = await client.callTool({ name: 'find_shops', arguments: { pincode } });
    if (shops.isError) console.log(`! find_shops ${pincode}: ${shops.structuredContent?.code || 'error'}`);
    else console.log(`✓ find_shops ${pincode}: ${shops.structuredContent.shops.length} shop(s)`);
  }

  console.log('\nLive smoke test passed.');
} finally {
  await client.close().catch(() => {});
}
