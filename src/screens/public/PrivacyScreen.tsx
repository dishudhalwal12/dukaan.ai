import React, { useEffect } from 'react';
import PublicShell, { PublicSection } from '../../components/PublicShell.tsx';
import { setPageMeta } from '../../utils/pageMeta.ts';

/**
 * The public privacy policy.
 *
 * Written from the code, not from a template: the sections match what the app and
 * the MCP server actually store. No retention period, legal entity, or address is
 * stated because none is defined anywhere in the product, and a reviewer asking
 * for one is easier to answer than a wrong number published here.
 */
const PrivacyScreen: React.FC = () => {
  useEffect(() => {
    setPageMeta({
      title: 'Privacy policy · Dukaan',
      description: 'What Dukaan stores when you order from a kirana shop in the app or through an AI assistant, why it is stored, and how to delete it.',
    });
  }, []);

  return (
    <PublicShell
      title="Privacy"
      intro="Dukaan connects customers to kirana shops, in the app and through an AI assistant. This page describes what is stored and why. It applies to the app and to the connector at dukaan-ai-hypnexis.vercel.app/mcp."
      updated="26 October 2026"
    >
      <PublicSection title="Account">
        <p>
          Signing in uses an email address and a password, or Google. Supabase handles the sign in and stores a
          hash of the password. Dukaan never receives the password itself, and neither does the assistant.
        </p>
      </PublicSection>

      <PublicSection title="Delivery details">
        <p>
          You type a name, a phone number, and an address line. The shop uses them to deliver and to call you.
          The maps position attached to an order is the location you allowed in the app, or a pin you shared in
          the chat.
        </p>
      </PublicSection>

      <PublicSection title="Location">
        <p>
          A position is captured only when you tap Allow location on the consent page, or when you send a map
          pin in the chat. It is used to find shops that deliver near you. A position older than 30 days is
          ignored, and the assistant asks for a pincode instead.
        </p>
        <p>You can remove the saved position on the consent page at any time.</p>
      </PublicSection>

      <PublicSection title="Orders">
        <p>
          An order stores the items, quantities, prices, the shop, the delivery details, and the status. The shop
          you order from sees that order. Other shops do not.
        </p>
      </PublicSection>

      <PublicSection title="Who sees what">
        <p>
          The shop sees your name, phone, address, and the basket it has to prepare. The AI assistant sees shop
          names, prices, the addresses you saved, and your orders. It does not see your password or another
          customer's data.
        </p>
        <p>Dukaan does not sell data.</p>
      </PublicSection>

      <PublicSection title="Server logs">
        <p>
          The connector logs a hashed user id, the tool name, the duration, and whether it succeeded. Names,
          phone numbers, addresses, and messages are not written to those lines.
        </p>
      </PublicSection>

      <PublicSection title="Payments">
        <p>
          Payment is cash on delivery. Dukaan does not take a card payment and does not store card numbers.
        </p>
      </PublicSection>

      <PublicSection title="Deleting your data">
        <p>
          Delete a saved address in the app, or ask the assistant to delete it. Remove the saved location on the
          consent page. Revoke an assistant from the connected apps in your account.
        </p>
        <p>
          For anything else, including deleting the account itself, contact us through the support page.
        </p>
      </PublicSection>

      <PublicSection title="Contact">
        <p>
          Questions about this page go to <a className="text-[#E6E6FA] underline" href="/support">support</a>.
        </p>
      </PublicSection>
    </PublicShell>
  );
};

export default PrivacyScreen;
