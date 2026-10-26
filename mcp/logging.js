import crypto from 'node:crypto';

/** PII-safe log helpers for the MCP server. */

export function hashId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

/** Masks emails and phone-like runs in free text. Addresses are left alone. */
export function redact(value) {
  return String(value ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[phone]');
}

/**
 * The provenance values a coordinate can carry. Anything else is dropped rather
 * than logged: an unknown label in a log is worse than no label, because it
 * reads as a real source.
 */
const PRECISION_VALUES = new Set(['app_location', 'chat_shared', 'geocoded', 'typed']);

/**
 * One JSON line per request.
 *
 * The field list is a whitelist, not a spread of the caller's object. A caller
 * that passes `address`, `phone`, or a free-text `note` must not be able to leak
 * customer data into a log just by naming the argument — and diagnostics that
 * arrive malformed (a string retry count, an invented precision) are dropped
 * instead of being written down as fact.
 */
export function toolLogLine({ tool, userId, durationMs, ok, code, status, retryCount, shopCount, precision }) {
  const line = {
    t: new Date().toISOString(),
    tool: String(tool || 'unknown'),
    user: hashId(userId),
    ms: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    ok: Boolean(ok),
    ...(code ? { code: String(code) } : {}),
    ...(Number.isFinite(status) ? { status: Number(status) } : {}),
    // A retry is the difference between "the socket died once" and "the database
    // is down"; it has to be visible without reading the customer's request.
    ...(Number.isFinite(retryCount) ? { retryCount: Number(retryCount) } : {}),
    // How many shops a discovery call ranked — the first number to look at when
    // a large deployment starts returning the wrong shop.
    ...(Number.isFinite(shopCount) ? { shopCount: Number(shopCount) } : {}),
    ...(PRECISION_VALUES.has(String(precision)) ? { precision: String(precision) } : {}),
  };
  return JSON.stringify(line);
}
