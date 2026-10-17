/**
 * Last-resort local SLM for the bot.
 *
 * Returns null when no local model server is configured. There is deliberately
 * no default URL: the previous hardcoded 'http://127.0.0.1:8080' meant a box
 * without a local model paid the full abort timeout on every message the cloud
 * providers had already failed, and then replied nothing anyway.
 *
 * @param {Array<{role: string, content: unknown}>} messages
 * @param {{ url?: string, timeoutMs?: number }} [options]
 * @returns {Promise<string|null>} the model's reply, or null
 */
export async function callLocalSlm(messages, { url, timeoutMs = 8000 } = {}) {
  const target = url || process.env.LLM_BASE_URL;
  // No configured local model means no local attempt at all — never a dial to
  // this host's own loopback.
  if (!target) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        max_tokens: 500,
        temperature: 0.5,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return content && content.trim() ? content.trim() : null;
  } catch (e) {
    console.warn(`[AI Engine] Local SLM fallback error (${e.message})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
