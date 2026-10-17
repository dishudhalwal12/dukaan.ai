/**
 * Reconciliation for the 2.5 s order poll.
 *
 * The SSE stream is the alerting path, but it can be slow or dropped behind a
 * proxy — when it is, the poll is the only thing that sees a new order. Letting
 * the poll raise the popup needs two guards, kept here so they can be reasoned
 * about (and tested) without React:
 *
 *   * the first poll of a session sees the whole backlog at once, so it must
 *     elect nobody (see `electPopupCandidates` — this is the "one chime per
 *     order" storm that the SSE-only path avoided);
 *   * an order is elected once, and the caller records it, so a later poll that
 *     keeps returning the same order cannot pop it again.
 *
 * Pure functions: no state, no clock, no network.
 */

import type { Order } from '../types.ts';

const COMPLETED = 'COMPLETED';

export interface PollMerge {
  /** The next list: newly discovered orders first, then the stored ones in order. */
  orders: Order[];
  /** The fresh rows the client had never seen — the popup candidates. */
  appeared: Order[];
  /** True when anything moved, so the caller can skip a pointless re-render. */
  changed: boolean;
}

/**
 * Fold a poll response into the stored list.
 *
 * A stored row is updated from its fresh twin, except that a fresh zero total or
 * an empty item list never blanks a value the client already knows, and a
 * `COMPLETED` order never regresses to an earlier status.
 */
export const mergePolledOrders = (prev: Order[], fresh: Order[]): PollMerge => {
  const safePrev = Array.isArray(prev) ? prev : [];
  const safeFresh = Array.isArray(fresh) ? fresh : [];

  const prevById = new Map(safePrev.map((o) => [o.id, o]));
  const updates = new Map<string, Order>();
  const appeared: Order[] = [];

  for (const next of safeFresh) {
    const existing = prevById.get(next.id);
    if (!existing) {
      appeared.push(next);
      continue;
    }

    const status =
      existing.status === COMPLETED && next.status !== COMPLETED ? existing.status : next.status;
    const total = next.total > 0 ? next.total : existing.total;
    const items = next.items && next.items.length > 0 ? next.items : existing.items;

    if (status !== existing.status || total !== existing.total || items !== existing.items) {
      updates.set(next.id, { ...existing, ...next, status, total, items });
    }
  }

  const mergedPrev = safePrev.map((o) => updates.get(o.id) ?? o);

  return {
    orders: [...appeared, ...mergedPrev],
    appeared,
    changed: appeared.length > 0 || updates.size > 0,
  };
};

/**
 * Which of the orders a poll just discovered may raise a popup.
 *
 * `primed` is false until the first poll has been folded in. A poll that elects
 * nothing still primes the caller, so a fresh browser marks the whole backlog as
 * seen and only a genuinely new order pops afterwards.
 */
export const electPopupCandidates = (
  appeared: Order[],
  seenIds: Set<string>,
  primed: boolean,
): string[] => {
  if (!primed) return [];
  return (Array.isArray(appeared) ? appeared : [])
    .filter((order) => !seenIds.has(order.id))
    .map((order) => order.id);
};
