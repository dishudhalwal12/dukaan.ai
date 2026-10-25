import crypto from 'node:crypto';

/**
 * An MCP order id that a customer can read over the phone.
 * Format: MCP-YYYYMMDD-XXXXXX (six random hex characters).
 *
 * The `MCP-` prefix keeps these out of the WhatsApp engine's `DKN-` sequence,
 * so the two writers can never collide on one shop.
 */
export function mcpOrderId(now = new Date(), randomBytes = crypto.randomBytes) {
  const date = new Date(now);
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
  const suffix = randomBytes(3).toString('hex').toUpperCase().slice(0, 6).padEnd(6, '0');
  return `MCP-${stamp}-${suffix}`;
}
