/**
 * Which tab — and which dashboard count — an order's status belongs to.
 *
 * The WhatsApp engine and the Supabase mirror speak one vocabulary
 * (`PENDING / ACCEPTED / OUT_FOR_DELIVERY / DELIVERED / CANCELLED`); the UI enum
 * in `src/types.ts` speaks another (`NEW / PREPARING / READY_FOR_PICKUP /
 * COMPLETED / REJECTED / CANCELLED`). An order may reach the UI in either, so one
 * predicate decides the group instead of a hand-written test per call site.
 *
 * The members are compared as plain strings, not through the enum, so this
 * module stays runnable under `node`'s type-stripping (which cannot execute a TS
 * `enum`). The string values are the enum's own values.
 */

export type RawOrderStatus = string | null | undefined;

const NEW_GROUP = ['NEW', 'PENDING'];
const PREPARING_GROUP = ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const HISTORY_GROUP = ['COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'];
const DEAD = ['REJECTED', 'CANCELLED'];
const ACCEPTED_SALE = ['PREPARING', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DELIVERED'];

/** True for an order that has not been accepted yet: `NEW` or engine `PENDING`. */
export const isNewOrder = (status: RawOrderStatus): boolean =>
  NEW_GROUP.includes(String(status ?? ''));

/** True while the order is being prepared, up to and including pickup/delivery. */
export const isPreparingGroup = (status: RawOrderStatus): boolean =>
  PREPARING_GROUP.includes(String(status ?? ''));

/** True once the order is done, one way or another: History. */
export const isHistoryGroup = (status: RawOrderStatus): boolean =>
  HISTORY_GROUP.includes(String(status ?? ''));

/** True when nothing was sold: the order was rejected or cancelled. */
export const isCancelledOrRejected = (status: RawOrderStatus): boolean =>
  DEAD.includes(String(status ?? ''));

/**
 * True when the order counts towards sales: accepted at some point and never
 * killed. `NEW`/`PENDING` are not sales yet.
 */
export const isAcceptedSale = (status: RawOrderStatus): boolean =>
  ACCEPTED_SALE.includes(String(status ?? ''));
