/**
 * Quantity and stock coercion.
 *
 * Stock went negative in two ways that had nothing to do with each other: the
 * product form accepted a typed `-5` (no `min`, a raw `parseInt`), and an order
 * line imported from a CSV, a bill photo or the WhatsApp backend could carry a
 * negative quantity, which the cancel path then added straight onto stock. A
 * number typed into a box looks valid to `parseInt`, so the guard has to live in
 * a function every writer goes through rather than in the form alone.
 *
 * All integers, because this app counts packets and pieces, never half a soap.
 */

export const MIN_STOCK = 0;
export const MIN_QUANTITY = 1;

/** A finite whole number, or `fallback` for anything unusable. */
const toWholeNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

/**
 * A stock count: never below zero.
 *
 * Zero is what "sold out" looks like, so an underflow is clamped to zero rather
 * than wrapping into a negative that the catalogue then renders as "-3 pcs" and
 * the supplier message quotes back.
 */
export const normalizeStock = (value: unknown): number =>
  Math.max(MIN_STOCK, toWholeNumber(value, MIN_STOCK));

/**
 * An order line quantity: at least one.
 *
 * A line that exists but orders nothing is not a line, so an unusable value
 * becomes 1 rather than 0 — the previous `Number(x) || 1` already did this for
 * empty and `0`, and only let negative numbers through.
 */
export const normalizeQuantity = (value: unknown): number =>
  Math.max(MIN_QUANTITY, toWholeNumber(value, MIN_QUANTITY));

/**
 * Whether a user-typed stock value is usable as-is.
 *
 * The form uses this to say "stock cannot be negative" instead of silently
 * saving a corrected number the shopkeeper never saw.
 */
export const isValidStockInput = (value: string): boolean => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  if (!/^-?\d+$/.test(trimmed)) return false;
  return Number(trimmed) >= MIN_STOCK;
};
