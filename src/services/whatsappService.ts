import { Product } from '../types.ts';
import { parseSseBuffer } from './apiClient.ts';
import { apiUrl, authHeaders } from './apiSession.ts';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  user: {
    /** Not sent by the server: a WhatsApp id is a JID carrying the number. */
    id?: string;
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

export const whatsappService = {
  /**
   * Fetches the current connection status and linked user info
   */
  async fetchStatus(): Promise<WhatsAppStatus> {
    try {
      const res = await fetch(apiUrl('/api/status'), { headers: await authHeaders() });
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
    const res = await fetch(apiUrl('/api/qr'), { headers: await authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Requests a fresh QR code from Baileys
   */
  async refreshQR(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(apiUrl('/api/refresh-qr'), { method: 'POST', headers: await authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Requests an 8-digit pairing code for phone-number based linking
   */
  async requestPairingCode(phoneNumber: string): Promise<{ success: boolean; code?: string; error?: string }> {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const res = await fetch(apiUrl('/api/pairing-code'), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
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
    const res = await fetch(apiUrl('/api/logout'), { method: 'POST', headers: await authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /**
   * Accepts a pending customer order and sends a WhatsApp confirmation message
   */
  async acceptOrder(orderId: string): Promise<{ success: boolean; order?: any }> {
    const res = await fetch(apiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/accept`), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
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
    const res = await fetch(apiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/reject`), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
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
    const res = await fetch(apiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/ready`), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
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
    const res = await fetch(apiUrl(`/api/dukan/orders/${encodeURIComponent(orderId)}/delivered`), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Synchronizes Nukkad POS products into the Baileys catalog
   */
  async syncCatalog(products: Product[]): Promise<{ success: boolean; count?: number }> {
    const res = await fetch(apiUrl('/api/dukan/catalog/sync'), {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ products }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Fetches the customer orders for the signed-in account.
   *
   * The account is NOT named here: the server derives it from the access token,
   * so a caller cannot ask for anyone else's orders by editing the request.
   */
  async fetchOrders(): Promise<{ orders: any[] }> {
    try {
      const res = await fetch(apiUrl('/api/dukan/orders'), { headers: await authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[WhatsAppService] fetchOrders error:', err);
      return { orders: [] };
    }
  },

  /**
   * Subscribes to real-time events (SSE). Reconnects after 3 s if the stream
   * drops, and returns a cleanup function.
   *
   * This uses fetch + a stream reader rather than EventSource because the
   * request has to carry the Bearer token and the ngrok bypass header, and
   * EventSource can set neither.
   */
  subscribeToEvents(onEvent: (event: WhatsAppEvent) => void): () => void {
    let disposed = false;
    let controller: AbortController | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = (delayMs: number) => {
      if (disposed) return;
      reconnectTimeout = setTimeout(connect, delayMs);
    };

    const connect = async () => {
      if (disposed) return;
      controller = new AbortController();
      try {
        const res = await fetch(apiUrl('/events'), {
          headers: await authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { messages, rest } = parseSseBuffer(buffer);
          buffer = rest;
          for (const message of messages) {
            try {
              onEvent(JSON.parse(message));
            } catch (err) {
              console.error('[WhatsAppService] Failed to parse SSE event data:', err);
            }
          }
        }
        // The stream ended without an error: treat it as a drop and reconnect.
        scheduleReconnect(3000);
      } catch (err) {
        if (!disposed && (err as any)?.name !== 'AbortError') {
          console.warn('[WhatsAppService] Event stream error:', err);
          scheduleReconnect(3000);
        }
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (controller) {
        controller.abort();
        controller = null;
      }
    };
  },
};
