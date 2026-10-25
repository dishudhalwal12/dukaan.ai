import { readConfig, requireConfig } from '../../mcp/config.js';
import { serviceClient } from '../../mcp/supabase.js';

/**
 * Deletes expired, unused quotes older than 24 hours.
 *
 * Run daily from a scheduler (Supabase cron, GitHub Actions, or the host's
 * timer). Quote rows are small; this is housekeeping, not correctness.
 */
const config = requireConfig(readConfig());
const db = serviceClient(config);
const { data, error } = await db.rpc('mcp_expire_quotes');
if (error) {
  console.error(`cleanup failed: ${error.message}`);
  process.exit(1);
}
console.log(`removed ${Number(data) || 0} expired quote(s)`);
