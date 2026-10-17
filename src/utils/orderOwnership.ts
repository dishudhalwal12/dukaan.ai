/**
 * Which backend orders a signed-in account is allowed to see.
 *
 * The WhatsApp backend is shared by many shops, and an order it created without
 * a resolvable owner carries no `userId`. Only an order explicitly owned by the
 * current account may enter that account's state — foreign and ownerless rows
 * are dropped, so a fresh account never inherits another shop's orders.
 */

export interface OwnedOrder {
  userId?: string | null;
}

/** True only when `order` is explicitly and non-emptily owned by `userId`. */
export const orderBelongsTo = (order: OwnedOrder | null | undefined, userId?: string | null): boolean =>
  typeof userId === 'string' &&
  userId.length > 0 &&
  !!order &&
  order.userId === userId;

/** Keep only orders owned by `userId`; drops foreign and ownerless rows. */
export const ownedOrdersOnly = <T extends OwnedOrder>(orders: T[], userId?: string | null): T[] =>
  (Array.isArray(orders) ? orders : []).filter((order) => orderBelongsTo(order, userId));

