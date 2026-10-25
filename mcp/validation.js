/** Small input normalisers shared by the MCP tools. */

export function normalisePhone(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return `+91${digits.slice(2)}`;
  if (value.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function normalisePincode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

export function normaliseName(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 80) return null;
  return value;
}
