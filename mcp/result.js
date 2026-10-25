/** Uniform tool results: a readable text line plus structured data for hosts. */

export function ok(text, structured = {}) {
  return {
    content: [{ type: 'text', text }],
    structuredContent: { ok: true, ...structured },
  };
}

export function fail(code, message, details = undefined) {
  const payload = { ok: false, code, message, ...(details === undefined ? {} : { details }) };
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: payload,
  };
}

export function fromError(error, fallbackCode = 'internal_error') {
  const code = error?.code && typeof error.code === 'string' ? error.code : fallbackCode;
  const message = error?.message || 'Something went wrong.';
  return fail(code, message);
}
