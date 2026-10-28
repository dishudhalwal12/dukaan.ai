import React, { useEffect, useState } from 'react';
import Card from '../components/Card.tsx';
import { WhatsAppIcon } from '../components/Icons.tsx';
import { fetchMcpSettingsFromCloud, saveMcpSettingsToCloud, McpSettings } from '../services/cloudSync.ts';

const DEFAULT_SETTINGS: McpSettings = { mcpEnabled: true, deliveryRadiusKm: 5, ordersPaused: false };

interface OnlineStoreScreenProps {
  onBack?: () => void;
}

const OnlineStoreScreen: React.FC<OnlineStoreScreenProps> = ({ onBack }) => {
  const [isStoreCreated, setIsStoreCreated] = useState(false);
  const [settings, setSettings] = useState<McpSettings>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMcpSettingsFromCloud()
      .then((value) => {
        if (!alive || !value) return;
        // AI ordering is a product default, not a shopkeeper task. If an older
        // row still says false, show it as on and repair the row once.
        const next = { ...value, mcpEnabled: true };
        setSettings(next);
        if (!value.mcpEnabled) void saveMcpSettingsToCloud(next);
      })
      .finally(() => {
        if (alive) setLoadingSettings(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (next: McpSettings) => {
    const enabled = { ...next, mcpEnabled: true };
    setSettings(enabled);
    setSaving(true);
    setSaved(null);
    const ok = await saveMcpSettingsToCloud(enabled);
    setSaving(false);
    setSaved(ok ? 'Saved.' : 'Could not save. Sign in and try again.');
  };

  const AiOrderingCard = (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800">Order from AI assistants</h2>
          <p className="mt-1 text-sm text-gray-600">
            Let customers order from your shop in ChatGPT, Claude, OpenCode, or any MCP-capable assistant.
            They see your live catalog and prices; they can place an order only after confirming the basket,
            total, and delivery address.
          </p>
        </div>
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${!settings.ordersPaused ? 'bg-green-500' : 'bg-amber-400'}`} />
      </div>

      {loadingSettings ? (
        <p className="mt-4 text-sm text-gray-500">Loading settings…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            {settings.ordersPaused ? 'AI ordering is paused' : 'AI ordering is on for this shop'}
          </div>
          <p className="text-xs text-gray-500">It is on automatically. Use Pause only when the shop is closed or you cannot fulfil new orders.</p>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Delivery radius: {settings.deliveryRadiusKm} km</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={settings.deliveryRadiusKm}
              onChange={(event) => setSettings({ ...settings, deliveryRadiusKm: Number(event.target.value) })}
              onMouseUp={(event) => save({ ...settings, deliveryRadiusKm: Number((event.target as HTMLInputElement).value) })}
              onTouchEnd={(event) => save({ ...settings, deliveryRadiusKm: Number((event.target as HTMLInputElement).value) })}
              className="mt-2 w-full accent-brand-accentInk"
            />
            <span className="text-xs text-gray-500">Applies to AI orders only. WhatsApp orders are unaffected.</span>
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">Pause AI orders</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-accentInk"
              checked={settings.ordersPaused}
              onChange={(event) => save({ ...settings, ordersPaused: event.target.checked })}
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <a href="/connect" className="text-sm font-semibold text-brand-accentInk underline">
              How customers connect
            </a>
            <span className="text-xs text-gray-500">{saving ? 'Saving…' : saved}</span>
          </div>
        </div>
      )}
    </Card>
  );

  const InitialState: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
      <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6">
        <span className="text-5xl">🛍️</span>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">You are invisible to online customers.</h2>
      <p className="text-gray-600 mb-8">Let's fix that!</p>
      <button
        onClick={onCreate}
        className="w-full max-w-xs bg-brand-accent text-black font-bold py-3 px-4 rounded-lg text-md shadow-md hover:bg-brand-accentHover transition-colors active:scale-95 transform"
      >
        Create My Free Online Store in 2 Minutes
      </button>
    </div>
  );

  const ActiveState: React.FC = () => (
    <div className="p-4 space-y-5">
      <Card>
        <p className="text-sm text-gray-500 mb-1">Your store link goes live with the public storefront.</p>
        <p className="font-semibold text-lg text-brand-accentInk">Not available in this beta</p>
      </Card>

      <button className="w-full bg-[#27AE60] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center text-lg shadow-md hover:opacity-90 transition-opacity active:scale-95 transform">
        <WhatsAppIcon className="w-6 h-6 mr-3" />
        Share Store with Customers
      </button>

      <div>
        <h3 className="font-bold text-gray-700 mb-2 px-1">Store Preview</h3>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="w-full h-20 bg-gray-200 rounded-md flex items-center justify-center mb-3">
            <p className="text-gray-400 text-sm">Your Store Banner</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gray-200 rounded-md"></div>
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-2 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button className="w-full bg-white text-gray-700 font-semibold py-3 px-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
          Add New Product
        </button>
        <button className="w-full bg-white text-gray-700 font-semibold py-3 px-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
          View Orders
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full">
      <header className="p-4 border-b border-gray-200 bg-white flex items-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : (
          <span className="h-9 w-9" />
        )}
        <h1 className="flex-1 text-center text-xl font-bold text-gray-800">Your Online Store</h1>
        <span className="h-9 w-9" />
      </header>
      <div className="p-4 space-y-5">
        {AiOrderingCard}
        {isStoreCreated ? <ActiveState /> : <InitialState onCreate={() => setIsStoreCreated(true)} />}
      </div>
    </div>
  );
};

export default OnlineStoreScreen;
