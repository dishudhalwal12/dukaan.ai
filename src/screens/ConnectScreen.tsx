import React, { useState } from 'react';

const ENDPOINT = (import.meta as any).env?.VITE_MCP_URL || 'https://mcp.dukaan.ai/mcp';

type ClientGuide = { id: string; label: string; steps: string[]; code?: string };

const GUIDES: ClientGuide[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    steps: [
      'Open Settings → Connectors → Advanced and turn on Developer mode.',
      'Choose Create, paste the endpoint below, and save.',
      'Complete the Dukaan sign-in and approve access.',
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
    steps: ['If your client only speaks stdio, bridge it to the remote server:'],
    code: `npx mcp-remote ${ENDPOINT}`,
  },
];

const ConnectScreen: React.FC = () => {
  const [active, setActive] = useState(GUIDES[0].id);
  const [copied, setCopied] = useState<string | null>(null);
  const guide = GUIDES.find((entry) => entry.id === active) || GUIDES[0];

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
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#3A3E98]">Dukaan.AI</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Order from your neighbourhood shop in any AI chat</h1>
        <p className="mt-3 text-gray-600">
          Connect Dukaan once. Then ask your assistant for milk, bread, or the week's groceries. It shows nearby shops,
          real prices, and a delivery address, and places the order only after you say yes.
        </p>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-700">MCP endpoint</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-100">{ENDPOINT}</code>
            <button
              type="button"
              onClick={() => copy(ENDPOINT)}
              className="rounded-lg bg-[#3A3E98] px-3 py-2 text-sm font-semibold text-white"
            >
              {copied === ENDPOINT ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            You will sign in to Dukaan and approve access. Your password is never shared with the AI assistant.
          </p>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap gap-2">
            {GUIDES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setActive(entry.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active === entry.id ? 'bg-[#3A3E98] text-white' : 'bg-white text-gray-700 border border-gray-200'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {guide.code && (
              <div className="mt-4">
                <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
                  <code>{guide.code}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => copy(guide.code!)}
                  className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
                >
                  {copied === guide.code ? 'Copied' : 'Copy config'}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">For customers</h2>
            <p className="mt-2 text-sm text-gray-600">
              Save an address once. Ask for items in your language. The assistant reads back the basket and the full
              delivery address before placing anything. Cash on delivery in this beta.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">For shopkeepers</h2>
            <p className="mt-2 text-sm text-gray-600">
              AI ordering is on automatically for every shop. Set a delivery radius between 1 and 10 km, and pause AI
              orders whenever the shop is closed. WhatsApp orders keep working.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold">Location and privacy</h2>
          <p className="mt-1">
            A shop's location is used only to find nearby shops. A delivery address is saved only when you choose to
            save it, is shared only with the shop you order from, and can be deleted at any time. A pincode or city is
            never treated as a precise delivery address.
          </p>
        </section>

        <p className="mt-8 text-center text-xs text-gray-500">
          Dukaan.AI · The shop around the corner, now in your AI chat.
        </p>
      </div>
    </main>
  );
};

export default ConnectScreen;
