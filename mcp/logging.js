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

export function toolLogLine({ tool, userId, durationMs, ok, code, status }) {
  const line = {
    t: new Date().toISOString(),
    tool: String(tool || 'unknown'),
    user: hashId(userId),
    ms: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    ok: Boolean(ok),
    ...(code ? { code: String(code) } : {}),
    ...(Number.isFinite(status) ? { status: Number(status) } : {}),
  };
  return JSON.stringify(line);
}
