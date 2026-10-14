import React, { useState, useEffect, useCallback } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import { whatsappService, WhatsAppStatus, WhatsAppEvent } from '../../services/whatsappService.ts';
import { WhatsAppIcon } from '../../components/Icons.tsx';

interface WhatsAppSettingsScreenProps {
  onBack: () => void;
}

const WhatsAppSettingsScreen: React.FC<WhatsAppSettingsScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'phone'>('qr');
  const [status, setStatus] = useState<WhatsAppStatus['status']>('disconnected');
  const [userInfo, setUserInfo] = useState<WhatsAppStatus['user']>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingQR, setRefreshingQR] = useState(false);

  // Phone pairing state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Unlink / logout state
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await whatsappService.fetchStatus();
      setStatus(data.status);
      setUserInfo(data.user);
      if (data.qr) {
        setQrDataUrl(data.qr);
      } else if (data.status === 'qr_ready' || data.status === 'disconnected') {
        const qrRes = await whatsappService.fetchQR().catch(() => null);
        if (qrRes?.qr) setQrDataUrl(qrRes.qr);
      }
    } catch (err) {
      console.warn('[WhatsAppSettings] Error loading status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and real-time SSE listener
  useEffect(() => {
    loadStatus();

    const unsubscribe = whatsappService.subscribeToEvents((event: WhatsAppEvent) => {
      if (event.type === 'init' || event.type === 'status') {
        if (event.status) setStatus(event.status);
        if (event.user !== undefined) setUserInfo(event.user);
        if (event.qr) setQrDataUrl(event.qr);
      } else if (event.type === 'qr') {
        if (event.qr) {
          setQrDataUrl(event.qr);
          setStatus('qr_ready');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadStatus]);

  const handleRefreshQR = async () => {
    try {
      setRefreshingQR(true);
      await whatsappService.refreshQR();
      const qrData = await whatsappService.fetchQR();
      if (qrData.qr) setQrDataUrl(qrData.qr);
    } catch (err) {
      console.error('Failed to refresh QR:', err);
    } finally {
      setRefreshingQR(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);
    setPairingCode(null);

    const clean = phoneNumber.replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      setPairingError('Please enter a valid phone number with country code (e.g. 919876543210)');
      return;
    }

    try {
      setPairingLoading(true);
      const res = await whatsappService.requestPairingCode(clean);
      if (res.code) {
        setPairingCode(res.code);
      } else {
        setPairingError(res.error || 'Failed to generate pairing code');
      }
    } catch (err: any) {
      setPairingError(err.message || 'Error connecting to WhatsApp service');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this WhatsApp device? Customers will not be able to order until re-linked.')) {
      return;
    }

    try {
      setDisconnecting(true);
      await whatsappService.logout();
      setStatus('disconnected');
      setUserInfo(null);
      setQrDataUrl(null);
      await handleRefreshQR();
    } catch (err) {
      console.error('Failed to disconnect WhatsApp:', err);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-12">
      <SettingsSubHeader title="WhatsApp Store & Ordering" onBack={onBack} />

      <div className="p-4 max-w-lg mx-auto space-y-5">
        {/* Connection Status Card */}
        <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-950/70 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <WhatsAppIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Device Status</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : status === 'connecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-neutral-500'
                    }`}
                  />
                  <p className="font-bold text-base">
                    {status === 'connected'
                      ? 'Connected & Live'
                      : status === 'connecting'
                      ? 'Connecting...'
                      : 'Not Linked'}
                  </p>
                </div>
              </div>
            </div>

            {status === 'connected' && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                Active
              </span>
            )}
          </div>

          {/* User Details if Connected */}
          {status === 'connected' && (
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Linked Number:</span>
                <span className="font-mono font-semibold text-white">
                  +{userInfo?.phone || userInfo?.id?.replace(/@.*$/, '') || '—'}
                </span>
              </div>
              {userInfo?.name && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-400">Display Name:</span>
                  <span className="font-medium text-white">{userInfo.name}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-950/50 hover:bg-red-900/60 border border-red-500/30 text-red-300 font-semibold text-sm transition-colors flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">link_off</span>
                  {disconnecting ? 'Disconnecting...' : 'Disconnect WhatsApp Device'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Device Linking Section (When not connected) */}
        {status !== 'connected' && (
          <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">Link Your WhatsApp Account</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Connect your business phone number to receive real customer orders and dispatch order acceptances directly from Dukaan.
              </p>
            </div>

            {/* Linking Method Tabs */}
            <div className="flex bg-[#121212] p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'qr'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-lg">qr_code_2</span>
                Scan QR Code
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('phone')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'phone'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-lg">dialpad</span>
                Pair with Phone
              </button>
            </div>

            {/* TAB 1: QR Code Scanner */}
            {activeTab === 'qr' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner min-h-[260px]">
                  {loading || (!qrDataUrl && refreshingQR) ? (
                    <div className="flex flex-col items-center justify-center py-10 text-neutral-600">
                      <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
                      <p className="text-xs font-medium mt-2">Generating live QR code...</p>
                    </div>
                  ) : qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="WhatsApp Web QR Code"
                      className="w-56 h-56 object-contain"
                    />
                  ) : (
                    <div className="text-center py-8 text-neutral-700">
                      <span className="material-symbols-outlined text-4xl text-neutral-400 mb-2">error</span>
                      <p className="text-sm font-medium">QR code unavailable</p>
                      <button
                        onClick={handleRefreshQR}
                        className="mt-3 px-4 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded-lg"
                      >
                        Generate QR Code
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={handleRefreshQR}
                    disabled={refreshingQR}
                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    <span className={`material-symbols-outlined text-sm ${refreshingQR ? 'animate-spin' : ''}`}>
                      refresh
                    </span>
                    Refresh QR Code
                  </button>
                </div>

                {/* Instructions */}
                <div className="bg-[#121212] p-4 rounded-xl border border-neutral-800/80 space-y-2 text-xs">
                  <p className="font-semibold text-neutral-200">How to link with QR code:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 leading-relaxed">
                    <li>Open <strong className="text-neutral-200">WhatsApp</strong> on your phone</li>
                    <li>Tap <strong className="text-neutral-200">Linked Devices</strong> (Settings on iPhone, or 3-dots on Android)</li>
                    <li>Tap <strong className="text-neutral-200">Link a Device</strong></li>
                    <li>Point your phone camera at this QR code</li>
                  </ol>
                </div>
              </div>
            )}

            {/* TAB 2: Pair with Phone Number */}
            {activeTab === 'phone' && (
              <div className="space-y-4">
                <form onSubmit={handleRequestPairingCode} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                      Phone Number (with Country Code)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">
                        +
                      </span>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="91 98765 43210"
                        className="w-full pl-8 pr-4 py-2.5 bg-[#121212] border border-neutral-700 rounded-xl text-white font-mono text-sm placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Include country code without + or spaces (e.g., 91 for India).
                    </p>
                  </div>

                  {pairingError && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {pairingError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pairingLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
                  >
                    {pairingLoading ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        Requesting Code...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">key</span>
                        Get 8-Digit Pairing Code
                      </>
                    )}
                  </button>
                </form>

                {pairingCode && (
                  <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl text-center space-y-3">
                    <p className="text-xs text-emerald-300 font-medium">Your WhatsApp Pairing Code</p>
                    <div className="text-3xl font-mono font-extrabold tracking-widest text-emerald-400 py-1">
                      {pairingCode.length === 8
                        ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}`
                        : pairingCode}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-500/50 text-xs font-semibold text-emerald-200 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      {copied ? 'Copied to Clipboard!' : 'Copy Code'}
                    </button>
                    <p className="text-[11px] text-neutral-400 leading-relaxed pt-1">
                      Tap the notification on your phone or open WhatsApp &gt; Linked Devices &gt; Link with phone number instead, and enter this code.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Features Note */}
        <div className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 text-xs text-neutral-400 space-y-1">
          <p className="font-semibold text-neutral-300">⚡ Production Engine Active</p>
          <p>
            When customers message your WhatsApp, Dukaan handles item lookups, computes live totals, and streams real orders directly to your screen with an instant sound alert.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSettingsScreen;
