/**
 * The four messages a shopkeeper action sends to the customer.
 *
 * These strings used to be inline inside the Express routes in server.js, which
 * made them impossible to test without booting WhatsApp. They live here now:
 * notifyCustomer() takes the socket, so a test can hand it a fake one and assert
 * exactly what the customer would receive.
 */
import {
  acceptedMessage,
  atPickupMessage,
  deliveredMessage,
  rejectedMessage,
} from './messages.js';

export const NOTIFICATION_KINDS = ['accepted', 'atPickup', 'delivered', 'rejected'];

/**
 * The text for one order event. `extra.reason` is used by 'rejected'.
 * Returns '' for an unknown kind or a missing order.
 */
export function orderNotificationText(kind, order, extra = {}) {
  if (!order || !order.id) return '';
  switch (kind) {
    case 'accepted':
      return acceptedMessage(order);
    case 'atPickup':
      return atPickupMessage(order);
    case 'delivered':
      return deliveredMessage(order);
    case 'rejected':
      return rejectedMessage(order, extra.reason);
    default:
      return '';
  }
}

/**
 * Sends the customer their notification for this order event.
 *
 * Returns the text that was sent, so the caller (or a test) can see it. Returns
 * null when there is nothing to send or no one to send it to. Throws only if the
 * underlying send fails, so the route keeps its own error logging.
 */
export async function notifyCustomer(sock, order, kind, extra = {}) {
  if (!sock || !order || !order.customerJid) return null;
  const text = orderNotificationText(kind, order, extra);
  if (!text) return null;
  await sock.sendMessage(order.customerJid, { text });
  return text;
}
