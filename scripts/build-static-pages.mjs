#!/usr/bin/env node
/**
 * Writes the three legal pages as plain HTML into public/.
 *
 * The app renders these pages in React, which means the HTML a crawler or a
 * review checker receives is an empty shell. OpenAI's metadata check fetch the
 * privacy URL without running JavaScript and reported it as inaccessible, so the
 * same text is now also emitted as static files, and vercel.json routes the pretty
 * URLs at them. One command, no build step inside the app bundle.
 *
 *   node scripts/build-static-pages.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public');

const shell = ({ title, description, heading, intro, updated, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="theme-color" content="#000000" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #000; color: #fff; font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Manrope, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 18px 64px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .mark { width: 44px; height: 44px; border-radius: 14px; background: #E6E6FA; color: #000; display: grid; place-items: center; font-weight: 800; font-size: 20px; }
  .brand { font-weight: 800; color: #E6E6FA; text-decoration: none; }
  .kicker { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #737373; }
  .card { border: 1px solid #262626; background: #1A1A1A; border-radius: 16px; padding: 22px; }
  h1 { font-size: 26px; margin: 0 0 8px; letter-spacing: -.4px; }
  h2 { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: #E6E6FA; margin: 26px 0 8px; }
  p, li { color: #D4D4D4; margin: 0 0 10px; }
  .meta { color: #A3A3A3; font-size: 12px; }
  a { color: #E6E6FA; }
  nav { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; margin-top: 24px; font-size: 12px; color: #A3A3A3; }
  nav a { color: #A3A3A3; text-decoration: none; }
  .contact { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 18px; }
  .btn { display: inline-block; background: #E6E6FA; color: #000; font-weight: 700; text-decoration: none; padding: 10px 16px; border-radius: 12px; }
  .btn.ghost { background: transparent; color: #E5E5E5; border: 1px solid #404040; }
</style>
</head>
<body>
<main>
  <header>
    <a class="mark" href="/" aria-label="Dukaan home">D</a>
    <div>
      <a class="brand" href="/">Dukaan.AI</a>
      <div class="kicker">Order from the shop around the corner</div>
    </div>
  </header>
  <div class="card">
    <h1>${heading}</h1>
    ${intro ? `<p>${intro}</p>` : ''}
    ${updated ? `<p class="meta">Last updated ${updated}</p>` : ''}
    ${body}
  </div>
  <nav>
    <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/connect">Connect an assistant</a>
  </nav>
</main>
</body>
</html>
`;

export const privacyHtml = () => shell({
  title: 'Privacy policy · Dukaan',
  description: 'What Dukaan stores when you order from a kirana shop in the app or through an AI assistant, why it is stored, and how to delete it.',
  heading: 'Privacy',
  intro: 'Dukaan connects customers to kirana shops, in the app and through an AI assistant. This page describes what is stored and why. It applies to the app and to the connector at dukaan-ai-hypnexis.vercel.app/mcp.',
  updated: '26 October 2026',
  body: `
    <h2>Account</h2>
    <p>Signing in uses an email address and a password, or Google. Supabase handles the sign in and stores a hash of the password. Dukaan never receives the password itself, and neither does the assistant.</p>
    <h2>Delivery details</h2>
    <p>You type a name, a phone number, and an address line. The shop uses them to deliver and to call you. The maps position attached to an order is the location you allowed in the app, or a pin you shared in the chat.</p>
    <h2>Location</h2>
    <p>A position is captured only when you tap Allow location on the consent page, or when you send a map pin in the chat. It is used to find shops that deliver near you. A position older than 30 days is ignored, and the assistant asks for a pincode instead.</p>
    <p>You can remove the saved position on the consent page at any time.</p>
    <h2>Orders</h2>
    <p>An order stores the items, quantities, prices, the shop, the delivery details, and the status. The shop you order from sees that order. Other shops do not.</p>
    <h2>Who sees what</h2>
    <p>The shop sees your name, phone, address, and the basket it has to prepare. The AI assistant sees shop names, prices, the addresses you saved, and your orders. It does not see your password or another customer's data.</p>
    <p>Dukaan does not sell data.</p>
    <h2>Server logs</h2>
    <p>The connector logs a hashed user id, the tool name, the duration, and whether it succeeded. Names, phone numbers, addresses, and messages are not written to those lines.</p>
    <h2>Payments</h2>
    <p>Payment is cash on delivery. Dukaan does not take a card payment and does not store card numbers.</p>
    <h2>How long we keep it</h2>
    <p>An unused order preview is deleted 24 hours after it expires. A saved position stops being used after 30 days and stays until you remove it. A saved address stays until you delete it. An order stays while your account exists, because the shop and you may still need it.</p>
    <p>Logs keep a hashed user id, the tool name, the duration, and the outcome. They do not keep names, phone numbers, addresses, or messages.</p>
    <h2>Location is sensitive, so it is opt in</h2>
    <p>A position is personal data. Dukaan asks for it only after you tap Allow location, tells you what it is for at that moment, and never takes it silently. You can remove it on the consent page, and an assistant loses access to it as soon as you revoke that assistant.</p>
    <h2>Deleting your data</h2>
    <p>Delete a saved address in the app, or ask the assistant to delete it. Remove the saved location on the consent page. Revoke an assistant from the connected apps in your account.</p>
    <p>For anything else, including deleting the account itself, contact us through the <a href="/support">support page</a>.</p>
    <h2>Contact</h2>
    <p>Questions about this page go to <a href="/support">support</a>.</p>`,
});

export const termsHtml = () => shell({
  title: 'Terms of use · Dukaan',
  description: 'How ordering works on Dukaan: cash on delivery, shops accept or reject orders, and you can cancel until the shop accepts.',
  heading: 'Terms of use',
  intro: 'These terms cover ordering from a kirana shop through the Dukaan app or an AI assistant.',
  updated: '26 October 2026',
  body: `
    <h2>Who sells the goods</h2>
    <p>Each shop on Dukaan is an independent business. Dukaan is software that finds the shop, shows its prices, and passes your order to it. The shop is the seller and the one that delivers.</p>
    <h2>Orders and prices</h2>
    <p>Prices and stock come from the shop's own catalogue and are fixed for ten minutes while you confirm. If stock changes in that window, the order fails instead of being adjusted.</p>
    <p>A shop can reject an order it cannot fulfil. You can cancel until the shop accepts it. After that, call the shop.</p>
    <h2>Payment</h2>
    <p>Payment is cash on delivery. Dukaan does not take payment up front, so there is no refund process for money Dukaan never received.</p>
    <h2>Delivery</h2>
    <p>Each shop sets its own delivery radius, usually between one and ten kilometres, and delivers during its own hours. A paused shop does not accept new orders.</p>
    <h2>Using the service fairly</h2>
    <p>Do not place orders you do not intend to accept, and do not use automated tools to scrape shops or prices. There are rate limits on previews and orders per hour, and they apply to every account.</p>
    <h2>Availability</h2>
    <p>Dukaan is in beta. A shop can pause AI orders, and the service can be paused for maintenance. An order already placed stays visible and can still be tracked or cancelled.</p>
    <h2>Changes</h2>
    <p>If these terms change, the date at the top changes with them. Questions go to <a href="/support">support</a>.</p>`,
});

export const supportHtml = () => {
  const email = String(process.env.VITE_SUPPORT_EMAIL || '').trim();
  const whatsapp = String(process.env.VITE_SUPPORT_WHATSAPP || '').replace(/[^0-9]/g, '');
  const contact = email || whatsapp
    ? `<div class="contact">${email ? `<a class="btn" href="mailto:${email}">Email ${email}</a>` : ''}${whatsapp ? `<a class="btn ghost" href="https://wa.me/${whatsapp}">WhatsApp +${whatsapp}</a>` : ''}</div>`
    : '<p>The contact details are inside the app: open Settings, then Help Center. If you are reading this inside the app, the same screen has the number to call.</p>';

  return shell({
    title: 'Support · Dukaan',
    description: 'Get help with a Dukaan order, a delivery address, a saved location, or an AI assistant connection.',
    heading: 'Support',
    intro: 'Send a message and we will reply. For an order that is already with a shop, the shop\'s phone number is on the order and is usually faster.',
    body: `
      ${contact}
      <h2>The assistant cannot find a shop</h2>
      <p>Allow location on the consent page, or send a pincode or a map pin in the chat. A saved position older than 30 days is ignored, so a fresh pin is needed after a move.</p>
      <h2>An order is waiting</h2>
      <p>Waiting for the shop to accept means the shop has not looked at it yet. You can cancel until it accepts. After that, call the shop with the number on the order.</p>
      <h2>A wrong address</h2>
      <p>Ask the assistant to delete the saved address and add the correct one. An order that is already placed keeps the address it was placed with, so tell the shop if it is on the way.</p>
      <h2>Remove a saved location or an assistant</h2>
      <p>The saved position is removed on the consent page. An assistant is revoked from the connected apps in your account, which stops it from reading shops or placing orders immediately.</p>
      <h2>Privacy</h2>
      <p>What is stored, and how to delete it, is on the <a href="/privacy">privacy page</a>.</p>`,
  });
};

const pages = {
  'privacy.html': privacyHtml(),
  'terms.html': termsHtml(),
  'support.html': supportHtml(),
};

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  mkdirSync(out, { recursive: true });
  for (const [name, html] of Object.entries(pages)) {
    writeFileSync(resolve(out, name), html);
    console.log(`wrote public/${name} (${html.length} bytes)`);
  }
}
