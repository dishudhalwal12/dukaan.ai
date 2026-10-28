/** The UPI account the shop is paid into. */
export const STORE_UPI_ID = 'divyarth12@ybl';
export const STORE_UPI_NAME = 'Nukkad Store';

/**
 * A real, scannable UPI payment QR for an order.
 *
 * The QR encodes a `upi://pay` intent, so a payment app opens with the payee,
 * amount and transaction id already filled in. Shared by the live order sheet
 * and the walkthrough demo, so both show the same kind of code.
 */
export function buildUpiQrUrl(order: { id?: string; total?: number | string } | null): string {
  if (!order) return '';

  const params = new URLSearchParams({
    pa: STORE_UPI_ID,
    pn: STORE_UPI_NAME,
    am: Number(order.total ?? 0).toFixed(2),
    tid: String(order.id || '').replace(/[^a-zA-Z0-9]/g, ''),
    tn: `Payment for Order ${order.id || ''}`,
    cu: 'INR',
  });

  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`upi://pay?${params.toString()}`)}`;
}
