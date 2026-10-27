import React, { useEffect } from 'react';
import PublicShell, { PublicSection } from '../../components/PublicShell.tsx';
import { setPageMeta } from '../../utils/pageMeta.ts';

/**
 * Terms of use.
 *
 * Deliberately factual: Dukaan is software that passes an order to a shop, the
 * shop is the seller, and nothing is prepaid. Those three sentences are what most
 * disputes are about, so they are stated at the top instead of in clause 14.
 */
const TermsScreen: React.FC = () => {
  useEffect(() => {
    setPageMeta({
      title: 'Terms of use · Dukaan',
      description: 'How ordering works on Dukaan: cash on delivery, shops accept or reject orders, and you can cancel until the shop accepts.',
    });
  }, []);

  return (
    <PublicShell
      title="Terms of use"
      intro="These terms cover ordering from a kirana shop through the Dukaan app or an AI assistant."
      updated="26 October 2026"
    >
      <PublicSection title="Who sells the goods">
        <p>
          Each shop on Dukaan is an independent business. Dukaan is software that finds the shop, shows its
          prices, and passes your order to it. The shop is the seller and the one that delivers.
        </p>
      </PublicSection>

      <PublicSection title="Orders and prices">
        <p>
          Prices and stock come from the shop's own catalogue and are fixed for ten minutes while you confirm.
          If stock changes in that window, the order fails instead of being adjusted.
        </p>
        <p>
          A shop can reject an order it cannot fulfil. You can cancel until the shop accepts it. After that, call
          the shop.
        </p>
      </PublicSection>

      <PublicSection title="Payment">
        <p>
          Payment is cash on delivery. Dukaan does not take payment up front, so there is no refund process for
          money Dukaan never received.
        </p>
      </PublicSection>

      <PublicSection title="Delivery">
        <p>
          Each shop sets its own delivery radius, usually between one and ten kilometres, and delivers during its
          own hours. A paused shop does not accept new orders.
        </p>
      </PublicSection>

      <PublicSection title="Using the service fairly">
        <p>
          Do not place orders you do not intend to accept, and do not use automated tools to scrape shops or
          prices. There are rate limits on previews and orders per hour, and they apply to every account.
        </p>
      </PublicSection>

      <PublicSection title="Availability">
        <p>
          Dukaan is in beta. A shop can pause AI orders, and the service can be paused for maintenance. An order
          already placed stays visible and can still be tracked or cancelled.
        </p>
      </PublicSection>

      <PublicSection title="Changes">
        <p>
          If these terms change, the date at the top changes with them. Questions go to{' '}
          <a className="text-[#E6E6FA] underline" href="/support">support</a>.
        </p>
      </PublicSection>
    </PublicShell>
  );
};

export default TermsScreen;
