/**
 * Support contact details, in one place and configurable.
 *
 * The shopkeeper's own mobile number used to be a literal in two shipped
 * screens, so it was published in the public bundle. It now comes from
 * VITE_SUPPORT_WHATSAPP in the root .env — the same one file as every other key.
 * With no value set there is nothing to dial and the UI hides the row, rather
 * than falling back to a number nobody chose.
 */

/** Digits only, country code first. `+91 98765 43210` -> `919876543210`. */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string {
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

/** Readable Indian formatting. A bare 10-digit number is assumed to be Indian. */
export function formatWhatsAppNumber(raw: string | null | undefined): string {
  const digits = normaliseWhatsAppNumber(raw);
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return digits ? `+${digits}` : '';
}

const configured = import.meta.env?.VITE_SUPPORT_WHATSAPP as string | undefined;

export const SUPPORT_WHATSAPP_NUMBER = normaliseWhatsAppNumber(configured);
export const SUPPORT_WHATSAPP_LABEL = formatWhatsAppNumber(SUPPORT_WHATSAPP_NUMBER);
export const hasSupportWhatsApp = SUPPORT_WHATSAPP_NUMBER.length > 0;

export const supportTelHref = `tel:+${SUPPORT_WHATSAPP_NUMBER}`;

export const supportWhatsAppHref = (message?: string): string =>
  `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
