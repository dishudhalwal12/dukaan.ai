import React, { useEffect } from 'react';
import PublicShell, { PublicSection } from '../../components/PublicShell.tsx';
import { setPageMeta } from '../../utils/pageMeta.ts';
import { formatWhatsAppNumber, normaliseWhatsAppNumber } from '../../config/support.ts';

/**
 * Support page, also the contact URL a store reviewer will open.
 *
 * Both contacts come from the environment. When neither is configured the page
 * points at the in-app help instead of rendering an empty link, because a dead
 * contact on a submission page fails review and looks broken to a customer.
 */
const env = (import.meta as any).env || {};
const SUPPORT_EMAIL = String(env.VITE_SUPPORT_EMAIL || '').trim();
const SUPPORT_WHATSAPP = normaliseWhatsAppNumber(String(env.VITE_SUPPORT_WHATSAPP || ''));

const SupportScreen: React.FC = () => {
  useEffect(() => {
    setPageMeta({
      title: 'Support · Dukaan',
      description: 'Get help with a Dukaan order, a delivery address, a saved location, or an AI assistant connection.',
    });
  }, []);

  const hasContact = Boolean(SUPPORT_EMAIL || SUPPORT_WHATSAPP);

  return (
    <PublicShell
      title="Support"
      intro="Send a message and we will reply. For an order that is already with a shop, the shop's phone number is on the order and is usually faster."
    >
      {hasContact ? (
        <div className="flex flex-wrap gap-2">
          {SUPPORT_EMAIL && (
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="rounded-xl bg-[#E6E6FA] px-4 py-2.5 text-sm font-bold text-black hover:opacity-90"
            >
              Email {SUPPORT_EMAIL}
            </a>
          )}
          {SUPPORT_WHATSAPP && (
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
            >
              WhatsApp {formatWhatsAppNumber(SUPPORT_WHATSAPP)}
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 p-4 text-sm leading-relaxed text-neutral-300">
          The contact details are inside the app: open Settings, then Help Center. If you are reading this inside
          the app, the same screen has the number to call.
        </div>
      )}

      <PublicSection title="The assistant cannot find a shop">
        <p>
          Allow location on the consent page, or send a pincode or a map pin in the chat. A saved position older
          than 30 days is ignored, so a fresh pin is needed after a move.
        </p>
      </PublicSection>

      <PublicSection title="An order is waiting">
        <p>
          Waiting for the shop to accept means the shop has not looked at it yet. You can cancel until it
          accepts. After that, call the shop with the number on the order.
        </p>
      </PublicSection>

      <PublicSection title="A wrong address">
        <p>
          Ask the assistant to delete the saved address and add the correct one. An order that is already placed
          keeps the address it was placed with, so tell the shop if it is on the way.
        </p>
      </PublicSection>

      <PublicSection title="Remove a saved location or an assistant">
        <p>
          The saved position is removed on the consent page. An assistant is revoked from the connected apps in
          your account, which stops it from reading shops or placing orders immediately.
        </p>
      </PublicSection>

      <PublicSection title="Privacy">
        <p>
          What is stored, and how to delete it, is on the{' '}
          <a className="text-[#E6E6FA] underline" href="/privacy">privacy page</a>.
        </p>
      </PublicSection>
    </PublicShell>
  );
};

export default SupportScreen;
