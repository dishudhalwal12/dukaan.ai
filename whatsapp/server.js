import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';
import fs from 'fs';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { store } from './store.js';
import { dukanCatalog } from './dukanCatalog.js';
import { dukanOrders, selectOrders, ordersQueryFor } from './dukanOrders.js';
import { dukanBot, resolvePhoneNumber, resetAllContext } from './dukanBot.js';
import { notifyCustomer } from './orderNotifications.js';
import { registryStatus, mirrorOrder } from './dukanCloud.js';
import { installPosRoutes } from './posStatic.js';
import { createApiAuth } from './apiAuth.js';
import { corsOptionsFor, parseOrigins, FIRST_PARTY_ORIGINS } from './corsPolicy.js';
import { buildUpstreamRequest, resolveModelConfig } from './aiProxy.js';
import { resolveLocation } from './locationFetcher.js';
import { transcribeAudioMessage } from './audioTranscriber.js';

// Load Baileys from cloned directory
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  isJidBroadcast,
  isJidNewsletter,
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ONE environment file for the whole app, at the repository root rather than
// beside this file, so every key the bot or the frontend needs lives in a single
// place a human can edit. Existing environment variables WIN over .env (dotenv's
// default) — see the note in dukanBot.js.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5001;
const AUTH_DIR = path.resolve(__dirname, process.env.AUTH_DIR || './auth_info');
// The Vite build of the POS, served from this same origin (see posStatic.js).
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
let n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || '';

// Only the origins this app is actually served from may call the API; a
// wildcard let any website read a shopkeeper's orders. The first-party domains
// are always present so a stale panel env cannot take the POS offline.
const corsOrigins = [...new Set([...FIRST_PARTY_ORIGINS, ...parseOrigins(process.env.CORS_ORIGINS)])];
app.use(cors(corsOptionsFor({ allowedOrigins: corsOrigins })));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// This API sits on a public tunnel, so every /api route passes the policy in
// apiAuth.js before a handler can run. See that file for the route table.
const apiAuth = createApiAuth({
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  operatorIds: new Set(
    String(process.env.OPERATOR_USER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  ),
});
app.use('/api', apiAuth.run);

// The legacy Baileys/n8n ops console can re-pair the WhatsApp session, so it is
// NOT served by default. Set ENABLE_OPS_CONSOLE=1 to bring it back; the POS owns
// `/` and its own settings screen already handles linking.
if (process.env.ENABLE_OPS_CONSOLE === '1') {
  app.use('/ops', express.static(path.join(__dirname, 'public')));
}

// Erase all previous chatbot memory & carts on server start/restart
resetAllContext();

// The bot stamps each order with the owner of the shop that fulfils it, so it
// reaches exactly one account. With Supabase configured the owner comes from the
// matched shop's row; without it, the single local shop uses
// DUKAN_DEFAULT_OWNER_ID. Without ANY owner source bot orders reach nobody, so
// fail loud rather than let them vanish silently.
if (registryStatus() === 'configured') {
  console.log('[Cloud] Shop registry: Supabase (owner comes from the matched shop).');
} else if (!process.env.DUKAN_DEFAULT_OWNER_ID) {
  console.warn(
    '\n⚠️  No order owner configured (Supabase unset and DUKAN_DEFAULT_OWNER_ID unset).\n' +
    "    Bot-created orders will have no owner and will NOT appear in any shopkeeper's app.\n" +
    '    Set SUPABASE_URL + SUPABASE_SERVICE_KEY (multi-shop), or DUKAN_DEFAULT_OWNER_ID in\n' +
    '    whatsapp/.env for a single local shop, to route orders to an account.\n'
  );
} else {
  console.log(`[Cloud] Single-shop dev mode: orders are owned by ${process.env.DUKAN_DEFAULT_OWNER_ID}.`);
}

// State variables
let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let currentQR = null;
let currentQRDataUrl = null;
let userInfo = null;
let sseClients = new Set();
let webhookLogs = []; // recent 50 logs of webhook deliveries

const logger = pino({ level: 'warn' });
const rawMessageMap = new Map();

// Helper to push Server-Sent Events to all connected browser clients
function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

/**
 * Mirrors an order (or a status change) to Supabase so the shopkeeper app sees
 * it. Never throws and never blocks the shopkeeper's own response.
 */
async function mirrorOrderQuietly(order) {
  const result = await mirrorOrder(order);
  if (!result.ok && !result.skipped) {
    console.warn(`[Cloud] Supabase mirror failed for #${order?.id}: ${result.error}`);
  }
  return result;
}

// Clean phone number to WhatsApp JID format
function formatJid(number) {
  if (!number) return null;
  let clean = number.toString().trim();
  if (clean.includes('@s.whatsapp.net') || clean.includes('@g.us')) {
    return clean;
  }
  // Remove non-digit characters
  clean = clean.replace(/\D/g, '');
  if (!clean) return null;
  return `${clean}@s.whatsapp.net`;
}

// Recursively unwrap ephemeral, view-once, and edited message wrappers
export function unwrapMessage(msg) {
  let m = msg;
  while (m) {
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    } else if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    } else if (m.editedMessage?.message?.protocolMessage?.editedMessage) {
      m = m.editedMessage.message.protocolMessage.editedMessage;
    } else {
      break;
    }
  }
  return m;
}

// Extract message text from Baileys message object
export function extractMessageText(rawMessage) {
  const message = unwrapMessage(rawMessage);
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
  if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }
  if (message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      return parsed.id || parsed.title || '';
    } catch (e) {}
  }
  return '';
}

// Forward incoming message to n8n webhook
async function forwardToN8n(messageData) {
  if (!n8nWebhookUrl) return;

  const logEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    event: 'message.received',
    from: messageData.from,
    name: messageData.name,
    text: messageData.text,
    status: 'pending',
    responseCode: null,
    error: null,
  };

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Baileys-n8n-Bridge/1.0',
      },
      body: JSON.stringify({
        event: 'message.received',
        ...messageData,
      }),
    });

    logEntry.status = response.ok ? 'success' : 'failed';
    logEntry.responseCode = response.status;
    console.log(`[Webhook -> n8n] Dispatched message from ${messageData.from} - HTTP ${response.status}`);
  } catch (err) {
    logEntry.status = 'error';
    logEntry.error = err.message;
    console.error(`[Webhook -> n8n] Failed to send to ${n8nWebhookUrl}:`, err.message);
  }

  webhookLogs.unshift(logEntry);
  if (webhookLogs.length > 50) webhookLogs.pop();
  broadcastSSE({ type: 'webhook_log', log: logEntry });
}

// Initialize WhatsApp Socket
async function initWhatsApp() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    connectionStatus = 'connecting';
    broadcastSSE({ type: 'status', status: connectionStatus });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[Baileys] Connecting using WhatsApp Web v${version.join('.')} (isLatest: ${isLatest})`);

    sock = makeWASocket({
      version,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidNewsletter(jid),
      getMessage: async (key) => {
        return rawMessageMap.get(key.id) || undefined;
      },
    });

    sock.ev.process(async (events) => {
      // Credentials updated
      if (events['creds.update']) {
        await saveCreds();
      }

      // Connection state changes
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          currentQR = qr;
          try {
            currentQRDataUrl = await QRCode.toDataURL(qr);
          } catch (e) {
            console.error('Failed to generate QR data URL:', e);
          }

          connectionStatus = 'qr_ready';
          console.log('\n================ WhatsApp QR Code ================');
          console.log('Scan this QR code with WhatsApp on your phone:');
          qrcodeTerminal.generate(qr, { small: true });
          console.log('Or view the QR code in your browser at: http://localhost:' + PORT + '/ops');
          console.log('==================================================\n');

          broadcastSSE({
            type: 'qr',
            qr: currentQRDataUrl,
            status: connectionStatus,
          });
        }

        if (connection === 'open') {
          connectionStatus = 'connected';
          currentQR = null;
          currentQRDataUrl = null;

          userInfo = {
            id: sock.user?.id || '',
            phone: (sock.user?.id || '').replace(/@.*$/, '').replace(/:\d+/, ''),
            name: sock.user?.name || sock.user?.notify || 'WhatsApp User',
          };

          console.log(`\n🎉 [Baileys] Successfully connected as ${userInfo.phone} (${userInfo.name})!\n`);
          broadcastSSE({
            type: 'status',
            status: connectionStatus,
            // SSE is authenticated, so this may carry the linked account. Send
            // the number explicitly rather than the JID: the UI wants the
            // number, and a JID is a strange thing to publish.
            user: { name: userInfo.name, phone: userInfo.phone },
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`[Baileys] Connection closed. Status Code: ${statusCode}`);

          if (statusCode === DisconnectReason.loggedOut) {
            console.log('[Baileys] Logged out. Clearing credentials...');
            connectionStatus = 'disconnected';
            userInfo = null;
            currentQR = null;
            currentQRDataUrl = null;
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (e) {}
            broadcastSSE({ type: 'status', status: 'disconnected', reason: 'logged_out' });
            setTimeout(() => initWhatsApp(), 2000);
          } else {
            connectionStatus = 'connecting';
            broadcastSSE({ type: 'status', status: 'connecting' });
            console.log('[Baileys] Reconnecting in 3 seconds...');
            setTimeout(() => initWhatsApp(), 3000);
          }
        }
      }

      // Incoming messages
      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        for (const msg of upsert.messages) {
          if (!msg.message) continue;

          // Cache raw message for retries
          if (msg.key.id) {
            rawMessageMap.set(msg.key.id, msg.message);
            if (rawMessageMap.size > 500) {
              const firstKey = rawMessageMap.keys().next().value;
              rawMessageMap.delete(firstKey);
            }
          }

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || isJidBroadcast(remoteJid) || isJidNewsletter(remoteJid)) continue;

          const unwrappedMsg = unwrapMessage(msg.message);
          let text = extractMessageText(unwrappedMsg);
          let locationData = null;
          let isVoiceNote = false;

          // 1. Process Voice Note / Audio Message
          if (unwrappedMsg?.audioMessage) {
            isVoiceNote = true;
            try {
              const transcribed = await transcribeAudioMessage(unwrappedMsg.audioMessage);
              if (transcribed) {
                text = transcribed;
                console.log(`[Voice Note -> Text]: "${transcribed}"`);
              }
            } catch (audioErr) {
              console.error('[Voice Note Error]:', audioErr.message);
            }
          }

          // 2. Process WhatsApp Location Pin
          if (unwrappedMsg?.locationMessage || unwrappedMsg?.liveLocationMessage) {
            try {
              const loc = await resolveLocation(unwrappedMsg.locationMessage || unwrappedMsg.liveLocationMessage);
              if (loc) {
                locationData = loc;
                text = loc.displayText;
                console.log(`[Location Pin]: ${loc.fullDescription}`);
              }
            } catch (locErr) {
              console.error('[Location Pin Error]:', locErr.message);
            }
          }

          const fromMe = Boolean(msg.key.fromMe);
          const isGroup = remoteJid.endsWith('@g.us');
          const pushName = msg.pushName || '';
          const timestamp = Number(msg.messageTimestamp) * 1000 || Date.now();
          const customerPhone = resolvePhoneNumber(remoteJid, AUTH_DIR);

          const messageRecord = {
            id: msg.key.id,
            remoteJid,
            from: customerPhone || remoteJid.replace(/@.*$/, ''),
            fromMe,
            senderJid: msg.key.participant || remoteJid,
            pushName,
            text,
            isVoiceNote,
            location: locationData,
            timestamp,
            isGroup,
            status: fromMe ? 'SENT' : 'RECEIVED',
            // Why this field exists: the bot shares the shopkeeper's own number, so
            // anything typed on that phone also arrives as fromMe:true. Without a
            // source, a human's private chat is indistinguishable from a bot reply
            // in the log (that is exactly how a dev conversation once landed in the
            // customer record). 'customer' = they wrote to us, 'human' = the phone
            // owner wrote it themselves.
            source: fromMe ? 'human' : 'customer',
          };

          // Save to store
          store.addMessage(messageRecord);

          // Broadcast to connected web browsers
          broadcastSSE({
            type: 'new_message',
            message: messageRecord,
          });

          // Forward to n8n webhook if it's an incoming message
          if (!fromMe && (text || locationData)) {
            forwardToN8n(messageRecord);

            // Dukan AI Bot order automation (for individual customer chats)
            if (!isGroup) {
              if (!dukanBot.shouldEngage(remoteJid, text)) {
                // Not engaged: the bot only answers after the customer sends "/hey".
                // Personal contacts messaging the shopkeeper's number are left untouched.
                console.log(`[Dukan Bot] Ignored (no "/hey" trigger): ${remoteJid}`);
              } else {
                try {
                  const botResult = await dukanBot.handleMessage(messageRecord, sock, locationData);
                  if (botResult?.reply) {
                    const replyResult = await sock.sendMessage(remoteJid, { text: botResult.reply });
                    const botReplyRecord = {
                      id: replyResult?.key?.id || ('bot-' + Date.now()),
                      remoteJid,
                      from: customerPhone || remoteJid.replace(/@.*$/, ''),
                      fromMe: true,
                      pushName: 'Dukan Assistant',
                      text: botResult.reply,
                      timestamp: Date.now(),
                      isGroup: false,
                      status: 'SENT',
                      source: 'bot',
                    };
                    store.addMessage(botReplyRecord);
                    broadcastSSE({ type: 'new_message', message: botReplyRecord });
                  }

                  if (botResult?.newOrder) {
                    console.log(`\n🛎️ [Dukan] NEW ORDER CREATED & BROADCAST!`);
                    console.log(`   Order ID: #${botResult.newOrder.id}`);
                    console.log(`   Customer: ${botResult.newOrder.customerName} (${botResult.newOrder.customerPhone})`);
                    console.log(`   Address:  ${botResult.newOrder.deliveryAddress}`);
                    console.log(`   Items:    ${(botResult.newOrder.items || []).map(it => `${it.quantity}x ${it.name} (₹${it.price || 0})`).join(', ')}`);
                    console.log(`   Total:    ₹${botResult.newOrder.totalAmount}\n`);
                    // Mirror into Supabase so the shopkeeper's app sees it too.
                    const mirror = await mirrorOrder(botResult.newOrder);
                    if (mirror.ok) console.log(`   Mirrored to Supabase (shop ${botResult.newOrder.userId}).`);
                    else if (!mirror.skipped) console.warn(`   ⚠️ Supabase mirror failed: ${mirror.error}`);
                    broadcastSSE({
                      type: 'dukan_new_order',
                      order: botResult.newOrder,
                    });
                  }
                } catch (botErr) {
                  console.error('[Dukan Bot Error]:', botErr);
                }
              }
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('[Baileys] Error starting socket:', err);
    connectionStatus = 'disconnected';
    broadcastSSE({ type: 'status', status: connectionStatus, error: err.message });
    setTimeout(() => initWhatsApp(), 5000);
  }
}

// ======================== REST API ROUTES ========================

// Health & Status. This route is PUBLIC — the watchdog, ngrok and the deploy
// script all use it as a health check — so it carries nothing about the shop.
// `user.id` used to be returned here, and a WhatsApp id is a JID: that
// published the shopkeeper's phone number to anyone who asked. The settings
// screen reads the linked number from the authenticated SSE `init` payload.
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    timestamp: new Date().toISOString(),
  });
});

// Model calls are proxied through here so the provider key stays on the server
// and never reaches the browser. Non-streaming and streamed (SSE) both pass.
// The model and the data policy are the server's decisions (see aiProxy.js), so
// a caller's own `model` is dropped and cannot spend the shop's credit on a
// model it never chose.
let aiConfigWarned = false;
function aiConfig() {
  const cfg = resolveModelConfig(process.env);
  if (!aiConfigWarned && cfg.dataCollection === 'deny' && /:free$/.test(cfg.model)) {
    aiConfigWarned = true;
    console.warn(
      `[AI Proxy] OPENROUTER_MODEL=${cfg.model} is a free model but AI_DATA_COLLECTION=deny. ` +
        'OpenRouter serves free models only from endpoints that collect data, so every call ' +
        'will fail with "No endpoints found matching your data policy". Either set ' +
        'AI_DATA_COLLECTION=allow, or set OPENROUTER_MODEL to a paid model to keep the guarantee.'
    );
  }
  return cfg;
}

app.post('/api/ai/chat/completions', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    return res.status(503).json({ error: 'ai_not_configured' });
  }

  try {
    const { url, init } = buildUpstreamRequest({
      body: req.body,
      apiKey,
      referer: `${req.protocol}://${req.get('host')}`,
      title: 'Dukaan.AI',
      ...aiConfig(),
    });

    const upstream = await fetch(url, init);
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    if (req.body && req.body.stream && upstream.ok && upstream.body) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    }

    res.send(await upstream.text());
  } catch (err) {
    console.error('[AI Proxy] upstream failed:', err?.message || err);
    if (!res.headersSent) res.status(502).json({ error: 'ai_upstream_failed' });
  }
});

// Current QR Code
app.get('/api/qr', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQRDataUrl,
    raw: currentQR,
  });
});

// Refresh QR Code manually
app.post('/api/refresh-qr', async (req, res) => {
  try {
    if (sock && connectionStatus !== 'connected') {
      try {
        sock.end();
      } catch (e) {}
    }
    // Clean partial credentials if not fully registered
    try {
      if (fs.existsSync(AUTH_DIR)) {
        const credsPath = path.join(AUTH_DIR, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
          if (!credsData.registered) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        }
      }
    } catch (e) {}

    initWhatsApp();
    res.json({ success: true, message: 'Refreshing QR code...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request 8-digit Pairing Code for linking via Phone Number
app.post('/api/pairing-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  const cleanNumber = phoneNumber.toString().replace(/\D/g, '');
  if (!sock) {
    return res.status(500).json({ error: 'WhatsApp socket not initialized yet' });
  }

  try {
    const code = await sock.requestPairingCode(cleanNumber);
    console.log(`[Baileys] Pairing code for ${cleanNumber}: ${code}`);
    res.json({ success: true, code });
  } catch (err) {
    console.error('[Baileys] Failed to generate pairing code:', err);
    res.status(500).json({ error: err.message || 'Failed to request pairing code' });
  }
});

// Send Message (Ideal for n8n HTTP Request node!)
app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: { to: 'Phone number (e.g. 919876543210)', message: 'Text message string' },
    });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({
      error: 'WhatsApp is not connected. Scan QR code or pair device first.',
      status: connectionStatus,
    });
  }

  const jid = formatJid(to);
  if (!jid) {
    return res.status(400).json({ error: 'Invalid phone number / JID format' });
  }

  try {
    const result = await sock.sendMessage(jid, { text: message.toString() });

    const messageRecord = {
      id: result.key.id,
      remoteJid: jid,
      from: jid.replace(/@.*$/, ''),
      fromMe: true,
      pushName: userInfo?.name || 'Me',
      text: message.toString(),
      timestamp: Date.now(),
      isGroup: jid.endsWith('@g.us'),
      status: 'SENT',
    };

    store.addMessage(messageRecord);
    broadcastSSE({ type: 'new_message', message: messageRecord });

    console.log(`[API Send] Message sent to ${jid}: "${message.slice(0, 30)}${message.length > 30 ? '...' : ''}"`);

    res.json({
      success: true,
      messageId: result.key.id,
      to: jid,
      timestamp: messageRecord.timestamp,
    });
  } catch (err) {
    console.error(`[API Send] Failed to send message to ${jid}:`, err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// Chats List
app.get('/api/chats', (req, res) => {
  res.json({ chats: store.getChats() });
});

// Messages in a Chat
app.get('/api/chats/:jid/messages', (req, res) => {
  const jid = req.params.jid;
  store.markChatRead(jid);
  res.json({ messages: store.getMessages(jid) });
});

// Mark Chat as Read
app.post('/api/chats/:jid/read', (req, res) => {
  store.markChatRead(req.params.jid);
  res.json({ success: true });
});

// Configure n8n Webhook URL
app.get('/api/webhook', (req, res) => {
  res.json({ webhookUrl: n8nWebhookUrl });
});

app.post('/api/webhook', (req, res) => {
  const { webhookUrl } = req.body;
  n8nWebhookUrl = (webhookUrl || '').trim();

  // Update .env file
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('N8N_WEBHOOK_URL=')) {
      envContent = envContent.replace(/N8N_WEBHOOK_URL=.*/g, `N8N_WEBHOOK_URL=${n8nWebhookUrl}`);
    } else {
      envContent += `\nN8N_WEBHOOK_URL=${n8nWebhookUrl}\n`;
    }
    fs.writeFileSync(envPath, envContent);
  } catch (err) {
    console.error('Failed to write .env:', err.message);
  }

  broadcastSSE({ type: 'config', n8nWebhookUrl });
  res.json({ success: true, webhookUrl: n8nWebhookUrl });
});

// Test n8n Webhook
app.post('/api/webhook/test', async (req, res) => {
  if (!n8nWebhookUrl) {
    return res.status(400).json({ error: 'No n8n Webhook URL configured' });
  }

  const testPayload = {
    event: 'test.webhook',
    from: '919876543210',
    fromJid: '919876543210@s.whatsapp.net',
    name: 'WhatsApp Test Contact',
    text: 'Hello from WhatsApp Baileys! If you see this in n8n, your webhook is working perfectly.',
    timestamp: new Date().toISOString(),
    isTest: true,
  };

  try {
    const startTime = Date.now();
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });
    const duration = Date.now() - startTime;

    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      event: 'test.webhook',
      from: 'Test Event',
      name: 'n8n Connectivity Test',
      text: testPayload.text,
      status: response.ok ? 'success' : 'failed',
      responseCode: response.status,
      durationMs: duration,
    };
    webhookLogs.unshift(logEntry);
    broadcastSSE({ type: 'webhook_log', log: logEntry });

    res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: duration,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Webhook Logs
app.get('/api/webhook/logs', (req, res) => {
  res.json({ logs: webhookLogs });
});

// Logout & Clear Session
app.post('/api/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock.end();
    }
  } catch (e) {}

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch (e) {}

  connectionStatus = 'disconnected';
  userInfo = null;
  currentQR = null;
  currentQRDataUrl = null;

  broadcastSSE({ type: 'status', status: 'disconnected', reason: 'manual_logout' });
  setTimeout(() => initWhatsApp(), 1500);

  res.json({ success: true, message: 'Logged out. Initializing new QR code...' });
});

// ======================== DUKAN SHOPKEEPER & ORDER APIS ========================

// Get AI Config
app.get('/api/dukan/ai-config', (req, res) => {
  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  res.json({
    hasApiKey: hasGroq || Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
    model: hasGroq ? (process.env.GROQ_MODEL || 'qwen/qwen3.8-27b') : (process.env.OPENROUTER_MODEL || 'openrouter/free'),
    provider: hasGroq ? 'Groq' : 'OpenRouter'
  });
});

// Update AI Config (Save Groq or OpenRouter Key & Model)
app.post('/api/dukan/ai-config', (req, res) => {
  const { apiKey, model, provider } = req.body;
  const isGroq = provider === 'Groq' || (apiKey && apiKey.trim().startsWith('gsk_'));

  if (isGroq) {
    if (apiKey !== undefined) process.env.GROQ_API_KEY = apiKey.trim();
    if (model) process.env.GROQ_MODEL = model.trim();
  } else {
    if (apiKey !== undefined) process.env.OPENROUTER_API_KEY = apiKey.trim();
    if (model) process.env.OPENROUTER_MODEL = model.trim();
  }

  // Persist to .env
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (isGroq) {
      if (envContent.includes('GROQ_API_KEY=')) {
        envContent = envContent.replace(/GROQ_API_KEY=.*/g, `GROQ_API_KEY=${process.env.GROQ_API_KEY || ''}`);
      } else {
        envContent += `\nGROQ_API_KEY=${process.env.GROQ_API_KEY || ''}\n`;
      }
      if (envContent.includes('GROQ_MODEL=')) {
        envContent = envContent.replace(/GROQ_MODEL=.*/g, `GROQ_MODEL=${process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'}`);
      } else {
        envContent += `\nGROQ_MODEL=${process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'}\n`;
      }
    } else {
      if (envContent.includes('OPENROUTER_API_KEY=')) {
        envContent = envContent.replace(/OPENROUTER_API_KEY=.*/g, `OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY || ''}`);
      } else {
        envContent += `\nOPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY || ''}\n`;
      }
      if (envContent.includes('OPENROUTER_MODEL=')) {
        envContent = envContent.replace(/OPENROUTER_MODEL=.*/g, `OPENROUTER_MODEL=${process.env.OPENROUTER_MODEL || 'openrouter/free'}`);
      } else {
        envContent += `\nOPENROUTER_MODEL=${process.env.OPENROUTER_MODEL || 'openrouter/free'}\n`;
      }
    }

    fs.writeFileSync(envPath, envContent);
  } catch (err) {
    console.error('Failed to update .env:', err.message);
  }

  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  res.json({
    success: true,
    hasApiKey: hasGroq || Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
    model: hasGroq ? (process.env.GROQ_MODEL || 'qwen/qwen3.8-27b') : (process.env.OPENROUTER_MODEL || 'openrouter/free'),
    provider: hasGroq ? 'Groq' : 'OpenRouter'
  });
});

// Test AI Connection (Groq or OpenRouter)
app.post('/api/dukan/ai-test', async (req, res) => {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const groqModel = (process.env.GROQ_MODEL || 'qwen/qwen3.8-27b').trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const openRouterModel = (process.env.OPENROUTER_MODEL || 'openrouter/free').trim();

  if (groqKey) {
    try {
      const startTime = Date.now();
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: 'You are Bhaiya from Dukan shop. Reply in 1 warm sentence in Hinglish.' },
            { role: 'user', content: 'Bhaiya, Maggi hai kya?' }
          ],
          temperature: 0.6,
          max_completion_tokens: 100,
          top_p: 0.95
        })
      });

      const data = await response.json();
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: data.error?.message || `HTTP ${response.status}`,
          durationMs
        });
      }

      const reply = data.choices?.[0]?.message?.content || 'No text returned';
      return res.json({
        success: true,
        model: groqModel,
        provider: 'Groq',
        reply,
        durationMs
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (!openRouterKey) {
    return res.status(400).json({ success: false, error: 'No Groq or OpenRouter API key configured yet.' });
  }

  try {
    const startTime = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Dukan AI Assistant',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          { role: 'system', content: 'You are Bhaiya from Dukan shop. Reply in 1 warm sentence in Hinglish.' },
          { role: 'user', content: 'Bhaiya, Maggi hai kya?' }
        ],
        max_tokens: 60
      })
    });

    const data = await response.json();
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error?.message || `HTTP ${response.status}`,
        durationMs
      });
    }

    const reply = data.choices?.[0]?.message?.content || 'No text returned';
    res.json({
      success: true,
      model: openRouterModel,
      provider: 'OpenRouter',
      reply,
      durationMs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Catalog
app.get('/api/dukan/catalog', (req, res) => {
  res.json({ catalog: dukanCatalog.getAll() });
});

// Bulk Sync Catalog from Shopkeeper POS
app.post('/api/dukan/catalog/sync', (req, res) => {
  const { products } = req.body;
  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Array of products is required' });
  }
  const updatedCatalog = dukanCatalog.syncFromStore(products);
  broadcastSSE({ type: 'dukan_catalog_updated' });
  console.log(`[Dukan Catalog] Synced ${updatedCatalog.length} products from store.`);
  res.json({ success: true, count: updatedCatalog.length, catalog: updatedCatalog });
});

// Add Product to Catalog
app.post('/api/dukan/catalog', (req, res) => {
  const { name, category, price, unit, inStock } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const item = dukanCatalog.addProduct({ name, category, price, unit, inStock });
  broadcastSSE({ type: 'dukan_catalog_updated' });
  res.json({ success: true, product: item });
});

// Update Product
app.put('/api/dukan/catalog/:id', (req, res) => {
  const updated = dukanCatalog.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  broadcastSSE({ type: 'dukan_catalog_updated' });
  res.json({ success: true, product: updated });
});

// Delete Product
app.delete('/api/dukan/catalog/:id', (req, res) => {
  const ok = dukanCatalog.deleteProduct(req.params.id);
  broadcastSSE({ type: 'dukan_catalog_updated' });
  res.json({ success: ok });
});

// Get Orders — scoped to the requesting account. `?scope=all` is the operator
// console's explicit cross-shop view; an unowned/unidentified request gets [].
app.get('/api/dukan/orders', (req, res) => {
  res.json({ orders: selectOrders(ordersQueryFor(req)) });
});

// Get Dukan Stats
app.get('/api/dukan/stats', (req, res) => {
  const all = selectOrders(ordersQueryFor(req));
  const pending = all.filter(o => o.status === 'PENDING').length;
  const accepted = all.filter(o => o.status === 'ACCEPTED' || o.status === 'PREPARING' || o.status === 'OUT_FOR_DELIVERY').length;
  const delivered = all.filter(o => o.status === 'DELIVERED').length;
  const totalRevenue = all
    .filter(o => o.status === 'DELIVERED' || o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  res.json({
    totalOrders: all.length,
    pending,
    accepted,
    delivered,
    totalRevenue,
    catalogItems: dukanCatalog.getAll().length
  });
});

// Accept Order
app.post('/api/dukan/orders/:id/accept', async (req, res) => {
  const existing = dukanOrders.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (dukanOrders.isFinalStatus(existing.status)) {
    return res.status(409).json({ error: 'order_already_final', status: existing.status });
  }
  const order = dukanOrders.updateStatus(req.params.id, 'ACCEPTED');
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Notify customer on WhatsApp
  try {
    await notifyCustomer(sock, order, 'accepted');
  } catch (e) {
    console.error('Failed to notify customer of acceptance:', e.message);
  }

  await mirrorOrderQuietly(order);
  broadcastSSE({ type: 'dukan_order_updated', order });
  console.log(`[Dukan] Order #${order.id} ACCEPTED by shopkeeper.`);
  res.json({ success: true, order });
});

// Out for Delivery / At Doorstep
app.post('/api/dukan/orders/:id/ready', async (req, res) => {
  const existing = dukanOrders.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (dukanOrders.isFinalStatus(existing.status)) {
    return res.status(409).json({ error: 'order_already_final', status: existing.status });
  }
  const order = dukanOrders.updateStatus(req.params.id, 'OUT_FOR_DELIVERY');
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (sock && order.customerJid) {
    try {
      await notifyCustomer(sock, order, 'atPickup');
      console.log(`[Dukan] Sent doorstep notification for Order #${order.id} to ${order.customerJid}`);
    } catch (e) {
      console.error('Failed to notify customer of delivery partner at doorstep:', e.message);
    }

    // Order conversation is over, so close the bot chat now instead of leaving it
    // open for the full 12-minute idle window. Another order needs a fresh "/hey".
    dukanBot.closeConversation(order.customerJid);
  }

  await mirrorOrderQuietly(order);
  broadcastSSE({ type: 'dukan_order_updated', order });
  res.json({ success: true, order });
});

// Mark Delivered
app.post('/api/dukan/orders/:id/delivered', async (req, res) => {
  const existing = dukanOrders.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (dukanOrders.isFinalStatus(existing.status)) {
    return res.status(409).json({ error: 'order_already_final', status: existing.status });
  }
  const order = dukanOrders.updateStatus(req.params.id, 'DELIVERED');
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (sock && order.customerJid) {
    try {
      await notifyCustomer(sock, order, 'delivered');
      console.log(`[Dukan] Sent delivered notification for Order #${order.id} to ${order.customerJid}`);
    } catch (e) {
      console.error('Failed to notify customer of delivery completion:', e.message);
    }

    dukanBot.closeConversation(order.customerJid);
  }

  await mirrorOrderQuietly(order);
  broadcastSSE({ type: 'dukan_order_updated', order });
  res.json({ success: true, order });
});

// Reject Order
app.post('/api/dukan/orders/:id/reject', async (req, res) => {
  const existing = dukanOrders.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (dukanOrders.isFinalStatus(existing.status)) {
    return res.status(409).json({ error: 'order_already_final', status: existing.status });
  }
  const reason = req.body.reason || 'Item temporarily unavailable';
  const order = dukanOrders.updateStatus(req.params.id, 'REJECTED', { rejectReason: reason });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (sock && order.customerJid) {
    try {
      await notifyCustomer(sock, order, 'rejected', { reason });
    } catch (e) {
      console.error('Failed to notify customer of rejection:', e.message);
    }

    dukanBot.closeConversation(order.customerJid);
  }

  await mirrorOrderQuietly(order);
  broadcastSSE({ type: 'dukan_order_updated', order });
  res.json({ success: true, order });
});

// Server-Sent Events (SSE) for Real-Time Updates
app.get('/events', apiAuth.run, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial state immediately
  res.write(
    `data: ${JSON.stringify({
      type: 'init',
      status: connectionStatus,
      // Authenticated stream, so the linked account may be named here. The
      // public /api/status deliberately carries none of this.
      user: userInfo ? { name: userInfo.name, phone: userInfo.phone } : null,
      qr: currentQRDataUrl,
      n8nWebhookUrl,
    })}\n\n`
  );

  // Heartbeat ping every 25s
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// The POS, served last so every /api route and /events above stay unshadowed.
installPosRoutes(app, DIST_DIR);

// Start Server & WhatsApp Socket
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 WhatsApp Baileys + n8n Bridge running!`);
  console.log(`📱 POS app:       http://localhost:${PORT}`);
  console.log(`🛠️  Ops console:   http://localhost:${PORT}/ops`);
  console.log(`⚡ API Send:      POST http://localhost:${PORT}/api/send`);
  console.log(`🔗 n8n Webhook:   ${n8nWebhookUrl || '(Not configured yet - set in UI)'}`);
  console.log(`======================================================\n`);

  initWhatsApp();
});
