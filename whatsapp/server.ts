import http, { IncomingMessage, ServerResponse } from 'http';
import { createOrder, getLatestOrder, getAllOrders, updateOrderStatus, IncomingOrderPayload } from './dukanOrders.ts';

const PORT = Number(process.env.PORT || 5679);

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed as T);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Health check
  if (pathname === '/' || pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'dukaan.ai WhatsApp Order Engine (TypeScript)',
      port: PORT,
      timestamp: new Date().toISOString()
    });
  }

  // GET /webhook/latest-order or /latest-order
  if (method === 'GET' && (pathname === '/webhook/latest-order' || pathname === '/latest-order')) {
    const order = getLatestOrder();
    if (!order) {
      return sendJson(res, 200, {});
    }
    return sendJson(res, 200, order);
  }

  // GET /webhook/orders or /orders
  if (method === 'GET' && (pathname === '/webhook/orders' || pathname === '/orders')) {
    const orders = getAllOrders();
    return sendJson(res, 200, orders);
  }

  // POST /webhook/order, /webhook/latest-order, /api/orders, /orders
  // Creates a new WhatsApp order and syncs it straight to Supabase
  if (method === 'POST' && (
    pathname === '/webhook/order' || 
    pathname === '/webhook/latest-order' || 
    pathname === '/api/orders' || 
    pathname === '/orders' ||
    pathname === '/webhook/whatsapp'
  )) {
    try {
      const body = await parseJsonBody<IncomingOrderPayload>(req);
      const createdOrder = await createOrder(body);
      return sendJson(res, 201, {
        success: true,
        message: 'Order created and synced to Supabase',
        order: createdOrder
      });
    } catch (err: any) {
      console.error('[WhatsApp Server] Error handling order:', err);
      return sendJson(res, 400, {
        success: false,
        error: err.message || 'Invalid request body'
      });
    }
  }

  // PATCH /webhook/order/:id/status
  if (method === 'PATCH' && pathname.startsWith('/webhook/order/')) {
    try {
      const parts = pathname.split('/');
      const orderId = parts[3];
      const body = await parseJsonBody<{ status: string }>(req);
      const updated = await updateOrderStatus(orderId, body.status);
      return sendJson(res, 200, {
        success: true,
        order: updated
      });
    } catch (err: any) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  // Default 404
  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Dukaan.ai WhatsApp Order Engine (TypeScript) on :${PORT}`);
  console.log(` Webhook endpoint: http://localhost:${PORT}/webhook/latest-order`);
  console.log(` Create order endpoint: POST http://localhost:${PORT}/webhook/order`);
  console.log(`=================================================`);
});
