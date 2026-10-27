import React, { useEffect, useState } from 'react';
import PublicShell, { PublicSection } from '../components/PublicShell.tsx';
import { setPageMeta } from '../utils/pageMeta.ts';

const ENDPOINT = (import.meta as any).env?.VITE_MCP_URL || 'https://mcp.dukaan.ai/mcp';

type ClientGuide = { id: string; label: string; steps: string[]; code?: string };

const GUIDES: ClientGuide[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    steps: [
      'Open Settings → Connectors → Advanced and turn on Developer mode.',
      'Choose Create, paste the endpoint below, and save. Authentication is OAuth.',
      'Complete the Dukaan sign-in, allow location if you want shops found automatically, and approve.',
      'On a phone: create the connector on the web once. It belongs to your account, so the ChatGPT app and the mobile browser both have it.',
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    steps: [
      'Open the MCP panel in Antigravity and add a server.',
      'Choose HTTP or remote, not stdio, and paste the endpoint below.',
      'Run the prompt once. The first tool call opens the Dukaan consent page.',
      'If the panel asks for JSON, use { "mcpServers": { "dukaan": { "httpUrl": "<endpoint>" } } }.',
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    steps: [
      'Open Settings → Connectors → Add custom connector.',
      'Paste the endpoint below and choose Add.',
      'Sign in to Dukaan and approve the connection.',
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    steps: ['Run this once. The browser opens for Dukaan sign-in.'],
    code: `claude mcp add --transport http dukaan ${ENDPOINT}`,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    steps: ['Run this once. Then open /mcps and sign in to Dukaan. Config hot-reloads; no restart is needed.'],
    code: `opencode mcp add dukaan --global --url ${ENDPOINT}`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    steps: ['Add this to ~/.cursor/mcp.json, then restart Cursor.'],
    code: JSON.stringify({ mcpServers: { dukaan: { url: ENDPOINT } } }, null, 2),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    steps: ['Add this to .vscode/mcp.json, then start the server from the MCP panel.'],
    code: JSON.stringify({ servers: { dukaan: { type: 'http', url: ENDPOINT } } }, null, 2),
  },
  {
    id: 'terminal',
    label: 'Other clients',
    steps: ['If your client only speaks stdio, bridge it to the remote server. The bridge handles the OAuth flow:'],
    code: `npx mcp-remote ${ENDPOINT}`,
  },
];

/**
 * The page a customer and a reviewer land on.
 *
 * It is the only surface search engines can index, so the heading and the intro
 * say what the product does in the words people use ("order groceries from a
 * shop near me in ChatGPT"), and the client guides cover the assistants people
 * actually install, including a phone.
 */
const ConnectScreen: React.FC = () => {
  const [active, setActive] = useState(GUIDES[0].id);
  const [copied, setCopied] = useState<string | null>(null);
  const guide = GUIDES.find((entry) => entry.id === active) || GUIDES[0];

  useEffect(() => {
    setPageMeta({
      title: 'Order from a shop near you in ChatGPT, Claude, or Antigravity · Dukaan',
      description: 'Connect Dukaan to ChatGPT, Claude, Cursor, VS Code, or Antigravity with one endpoint. It finds a kirana shop that delivers to you, shows live prices, and places the order after you confirm. Cash on delivery.',
    });
  }, []);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Copy this value', value);
    }
  };

  return (
    <PublicShell
      title="Order from your neighbourhood shop in any AI chat"
      intro="Connect Dukaan once. Then ask your assistant for milk, bread, or the week's groceries. It finds a nearby kirana shop that delivers to you, shows real prices and stock, and places the order only after you confirm. Cash on delivery, in India."
    >
      <PublicSection title="MCP endpoint">
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-black px-3 py-2 text-sm text-neutral-100">{ENDPOINT}</code>
          <button
            type="button"
            onClick={() => copy(ENDPOINT)}
            className="rounded-lg bg-[#E6E6FA] px-3 py-2 text-sm font-bold text-black"
          >
            {copied === ENDPOINT ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Authentication is OAuth. You approve the assistant on Dukaan, and it never receives your password.
        </p>
      </PublicSection>

      <div className="flex flex-wrap gap-2">
        {GUIDES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setActive(entry.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              active === entry.id
                ? 'bg-[#E6E6FA] text-black'
                : 'border border-neutral-800 text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-800 p-4">
        <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed text-neutral-300">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.code && (
          <div className="mt-4">
            <pre className="overflow-x-auto rounded-lg bg-black p-4 text-xs leading-relaxed text-neutral-100">
              <code>{guide.code}</code>
            </pre>
            <button
              type="button"
              onClick={() => copy(guide.code!)}
              className="mt-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              {copied === guide.code ? 'Copied' : 'Copy config'}
            </button>
          </div>
        )}
      </div>

      <PublicSection title="What you can ask for">
        <p>
          Groceries, household items, personal care, and anything else the shop lists. Ask in English, Hindi, or
          Hinglish. The assistant reads back the items, the total, and the full address before anything is
          placed.
        </p>
      </PublicSection>

      <PublicSection title="For shopkeepers">
        <p>
          AI ordering is on for every shop. Open Settings → Online Store &amp; AI Orders to set a delivery radius
          between 1 and 10 km, and pause orders when the shop is closed. WhatsApp orders keep working the same
          way.
        </p>
      </PublicSection>

      <PublicSection title="Location and privacy">
        <p>
          A shop's location is used only to find shops near you. A delivery address is saved only when you choose
          to save it, is shared only with the shop you order from, and can be deleted at any time. A pincode or a
          city is never treated as a precise address.
        </p>
        <p>
          Details are on the <a className="text-[#E6E6FA] underline" href="/privacy">privacy page</a>.
        </p>
      </PublicSection>
    </PublicShell>
  );
};

export default ConnectScreen;
