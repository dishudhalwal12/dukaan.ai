import { Product } from '../types.ts';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  user: {
    id: string;
    name?: string;
    phone?: string;
  } | null;
  qr?: string | null;
  timestamp?: string;
}

export interface WhatsAppEvent {
  type: string;
  status?: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  user?: {
    id: string;
    name?: string;
    phone?: string;
  } | null;
  qr?: string | null;
  order?: any;
  message?: any;
  [key: string]: any;
}

const getApiUrl = (endpoint: string): string => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    if (window.location.port && window.location.port !== '5001') {
      return `http://localhost:5001${endpoint}`;
    }
  }
  return endpoint;
};

export const whatsappService = {
  /**
   * Fetches the current connection status and linked user info
   */
  async fetchStatus(): Promise<WhatsAppStatus> {
    try {
      const res = await fetch(getApiUrl('/api/status'));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[WhatsAppService] fetchStatus error:', err);
      return { status: 'disconnected', user: null, qr: null };
    }
  },

  /**
   * Fetches the current live QR code data URL
   */
  async fetchQR(): Promise<{ status: string; qr: string | null; raw: string | null }> {
    const res = await fetch(getApiUrl('/api/qr'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Requests a fresh QR code from Baileys
   */
  async refreshQR(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(getApiUrl('/api/refresh-qr'), { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Requests an 8-digit pairing code for phone-number based linking
   */
  async requestPairingCode(phoneNumber: string): Promise<{ success: boolean; code?: string; error?: string }> {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const res = await fetch(getApiUrl('/api/pairing-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: cleanNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },

  /**
   * Logs out / unlinks the current WhatsApp session
   */
  async logout(): Promise<{ success: boolean }> {
    const res = await fetch(getApiUrl('/api/logout'), { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Accepts a pending customer order and sends a WhatsApp confirmation message
   */
  async acceptOrder(orderId: string): Promise<{ success: boolean; order?: any }> {
    const res = await fetch(getApiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/accept`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Rejects a pending customer order and sends a WhatsApp rejection message
   */
  async rejectOrder(orderId: string, reason?: string): Promise<{ success: boolean; order?: any }> {
    const res = await fetch(getApiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/reject`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Notifies customer that delivery partner is at doorstep / order is ready at pickup
   */
  async readyOrder(orderId: string): Promise<{ success: boolean; order?: any }> {
    const res = await fetch(getApiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/ready`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Marks order delivered/completed and notifies customer
   */
  async deliverOrder(orderId: string): Promise<{ success: boolean; order?: any }> {
    const res = await fetch(getApiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/delivered`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Synchronizes Dukaan POS products into the Baileys catalog
   */
  async syncCatalog(products: Product[]): Promise<{ success: boolean; count?: number }> {
    const res = await fetch(getApiUrl('/api/dukan/catalog/sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Fetches the customer orders stored in the backend for ONE account.
   * The backend is shared across shops, so the owner is always named; an
   * unnamed request is served nothing rather than every shop's orders.
   */
  async fetchOrders(userId?: string | null): Promise<{ orders: any[] }> {
    try {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const res = await fetch(getApiUrl(`/api/dukan/orders${qs}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[WhatsAppService] fetchOrders error:', err);
      return { orders: [] };
    }
  },

  /**
   * Subscribes to real-time events via Server-Sent Events (SSE).
   * Automatically reconnects if connection drops.
   * Returns a cleanup function to close the stream.
   */
  subscribeToEvents(onEvent: (event: WhatsAppEvent) => void): () => void {
    let eventSource: EventSource | null = null;
    let isDisposed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (isDisposed) return;

      try {
        eventSource = new EventSource(getApiUrl('/events'));

        eventSource.onmessage = (e) => {
          try {
            const data: WhatsAppEvent = JSON.parse(e.data);
            onEvent(data);
          } catch (err) {
            console.error('[WhatsAppService] Failed to parse SSE event data:', err);
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isDisposed) {
            // Reconnect after 3 seconds
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.warn('[WhatsAppService] Error initializing EventSource:', err);
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  },
};
