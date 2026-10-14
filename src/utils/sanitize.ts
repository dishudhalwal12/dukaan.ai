/**
 * Sanitizes user-supplied strings before they are interpolated into LLM prompt templates.
 * Prevents prompt injection by removing or escaping characters that could break out of
 * the intended prompt context or alter model behavior.
 *
 * Rules applied:
 *  - Strips null bytes and other non-printable ASCII control characters
 *  - Collapses sequences of whitespace/newlines to a single space (prevents multi-line
 *    instruction injection via user fields)
 *  - Trims leading/trailing whitespace
 *  - Limits the string to `maxLength` characters to prevent context flooding
 */
export function sanitizeForPrompt(value: string, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // strip control characters
    .replace(/\s+/g, ' ')                     // collapse whitespace / newlines
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes a CSV field value to prevent spreadsheet formula injection.
 * If the value starts with =, @, +, or - it is prefixed with a tab character
 * so spreadsheet applications treat it as plain text instead of a formula.
 */
export function sanitizeCsvField(value: string): string {
  if (typeof value !== 'string') return String(value ?? '');
  const trimmed = value.trim();
  if (/^[=@+\-]/.test(trimmed)) {
    return '\t' + trimmed;
  }
  return trimmed;
}
