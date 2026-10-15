import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dukanCatalog } from './dukanCatalog.js';
import { dukanOrders } from './dukanOrders.js';
import { matchNearestShop } from './dukanShops.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

// In-memory conversation history: jid -> messages[]
const conversationHistories = new Map();

// In-memory last offered products per customer: jid -> product[]
export const lastOfferedItems = new Map();

// Active customer carts: jid -> { items: [], totalAmount: 0, customerName: '', deliveryAddress: '', location: null, updatedAt: number, status: 'staged' }
export const customerCarts = new Map();
// Alias for backward compatibility
export const pendingOrders = customerCarts;

// ─── Trigger Gate & Session Window ────────────────────────────────────────────
// The bot shares the shopkeeper's personal WhatsApp number, so it must never
// answer a contact who just says "hi". A chat is only engaged after the customer
// sends the exact "/hey" trigger, and then stays warm for a sliding idle window.
export const BOT_TRIGGER_REGEX = /^\s*\/hey\b/i;
export const SESSION_IDLE_TTL_MS = 12 * 60 * 1000; // 12 minutes

export const WELCOME_REPLY = `Welcome to Dukaan.

Send me your current location first — that is how I connect you to the store nearest to you.

Tap + (or the paperclip) next to the message box → Location → "Send your current location".`;

export const LOCATION_HOWTO_REPLY = `I still need that location pin to route your order to the nearest store.

How to send it:
1. Tap + (or the paperclip) next to the message box
2. Tap Location
3. Tap "Send your current location"

That one pin is all I need.`;

// jid -> last activity timestamp (ms)
const activeSessions = new Map();

// Onboarding handshake: "/hey" opens the chat, but ordering only starts once the
// customer shares a location pin (that pin decides WHICH store serves them).
const awaitingLocations = new Set();  // jids that sent /hey and still need a pin
const pendingRequests = new Map();    // jid -> text typed alongside /hey
export const activeShops = new Map(); // jid -> shop matched from their location

export function isBotTrigger(text) {
  return BOT_TRIGGER_REGEX.test(String(text || ''));
}

export function stripBotTrigger(text) {
  return String(text || '').replace(BOT_TRIGGER_REGEX, '').trim();
}

export function activateSession(jid, now = Date.now()) {
  if (jid) activeSessions.set(jid, now);
}

export function isSessionActive(jid, now = Date.now()) {
  if (!jid) return false;
  const lastActive = activeSessions.get(jid);
  if (!lastActive) return false;
  if (now - lastActive > SESSION_IDLE_TTL_MS) {
    activeSessions.delete(jid);
    return false;
  }
  return true;
}

export function endSession(jid) {
  if (jid) activeSessions.delete(jid);
}

/**
 * A cart the customer is still actively working on (within the idle window).
 * Keeps a mid-order customer from being silently dropped once the chat session
 * itself has lapsed, so "confirm" still lands.
 */
export function hasActiveCart(jid, now = Date.now()) {
  if (!jid) return false;
  const cart = customerCarts.get(jid);
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) return false;
  return now - (cart.updatedAt || 0) <= SESSION_IDLE_TTL_MS;
}

/**
 * True when this message should reach the ordering bot: either it carries the
 * "/hey" trigger, the chat already has a live session within the idle window,
 * or the customer has a fresh cart waiting to be confirmed.
 */
export function shouldEngage(jid, text, now = Date.now()) {
  return isBotTrigger(text) || isSessionActive(jid, now) || hasActiveCart(jid, now);
}

// ─── Location handshake ───────────────────────────────────────────────────────

export function isAwaitingLocation(jid) {
  return awaitingLocations.has(jid);
}

/** "/hey" received: clear the old order context and wait for a location pin. */
export function beginLocationHandshake(jid, pendingText = '') {
  if (!jid) return;
  customerCarts.delete(jid);
  conversationHistories.delete(jid);
  awaitingLocations.add(jid);
  if (pendingText) pendingRequests.set(jid, pendingText);
  else pendingRequests.delete(jid);
}

/**
 * Location pin received: stop waiting, remember which shop serves this customer
 * and hand back anything they typed alongside "/hey" so it is not lost.
 */
export function completeLocationHandshake(jid, shop) {
  awaitingLocations.delete(jid);
  if (shop) activeShops.set(jid, shop);
  const pending = pendingRequests.get(jid) || '';
  pendingRequests.delete(jid);
  return pending;
}

export function clearLocationHandshake(jid) {
  awaitingLocations.delete(jid);
  pendingRequests.delete(jid);
}

/**
 * Completely erases all in-memory chatbot context on server restart.
 */
export function resetAllContext() {
  customerCarts.clear();
  conversationHistories.clear();
  lastOfferedItems.clear();
  activeSessions.clear();
  awaitingLocations.clear();
  pendingRequests.clear();
  activeShops.clear();
  console.log('[Dukan Bot] Chatbot context completely erased on startup/restart.');
}

// Affirmative regex for explicit order confirmation
export const AFFIRMATIVE_REGEX = /^(yes|yeas|yep|yeah|yup|y|haan|ha|confirm|confirmed|proceed|order|order now|bhejo|haan bhej do|sahi hai bhej do|pack kar do|pack karo)[\s.!,]*$/i;

/**
 * Resolves real phone number from WhatsApp JID
 */
export function resolvePhoneNumber(jid, authDir) {
  if (!jid) return '';
  const cleanJid = jid.trim();
  if (!cleanJid.endsWith('@lid')) {
    return cleanJid.replace(/@.*$/, '').replace(/:\d+/, '');
  }
  const lid = cleanJid.replace(/@.*$/, '');
  const dir = authDir || path.resolve(__dirname, 'auth_info');
  const reverseFile = path.join(dir, `lid-mapping-${lid}_reverse.json`);
  if (fs.existsSync(reverseFile)) {
    try {
      const content = JSON.parse(fs.readFileSync(reverseFile, 'utf8'));
      if (typeof content === 'string' && /^\d+$/.test(content)) {
        return content;
      }
    } catch (e) {}
  }
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith('lid-mapping-') && !file.includes('_reverse')) {
          const filePath = path.join(dir, file);
          const mappedLid = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (mappedLid === lid) {
            return file.replace('lid-mapping-', '').replace('.json', '');
          }
        }
      }
    }
  } catch (e) {}
  return lid;
}

/**
 * Deduplicates an array of products by ID
 */
export function deduplicateProducts(products) {
  const seen = new Set();
  const deduped = [];
  for (const p of products) {
    if (!p || !p.id) continue;
    if (!seen.has(p.id)) {
      seen.add(p.id);
      deduped.push(p);
    }
  }
  return deduped;
}

/**
 * Deterministic Order Resolver & Pricing Engine.
 * Matches requested item names against dukanCatalog, retrieves authoritative prices,
 * computes item totals, and calculates the true order total.
 */
export function resolveAndPriceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: [], totalAmount: 0 };
  }

  const verifiedItems = [];

  for (const raw of rawItems) {
    if (!raw) continue;
    let query = String(raw.name || raw.query || raw.item || '').trim();
    query = query.replace(/\([^\)]+\)/g, '').replace(/product_/g, '').trim();
    const qty = Math.max(1, parseInt(raw.quantity || raw.qty, 10) || 1);

    const matches = dukanCatalog.search(query);
    if (matches.length > 0) {
      const matched = matches[0];
      const unitPrice = Number(matched.price) || 0;
      verifiedItems.push({
        id: matched.id,
        name: matched.name,
        category: matched.category,
        price: unitPrice,
        unit: matched.unit || 'unit',
        quantity: qty,
        total: unitPrice * qty
      });
    } else {
      const fallbackPrice = typeof raw.price === 'number'
        ? raw.price
        : (parseFloat(String(raw.price || 0).replace(/[^\d.]/g, '')) || 0);
      verifiedItems.push({
        name: raw.name || query || 'Item',
        price: fallbackPrice,
        quantity: qty,
        total: fallbackPrice * qty,
        unit: 'unit'
      });
    }
  }

  const totalAmount = verifiedItems.reduce((sum, it) => sum + (it.total || 0), 0);
  return { items: verifiedItems, totalAmount };
}

/**
 * Extracts order details from summary text (for compatibility / testing)
 */
export function extractOrderFromSummaryText(text, defaultAddress = '') {
  if (!text) return null;

  let deliveryAddress = defaultAddress;
  const addrMatch = text.match(/(?:Delivery\s*Address|Address|Delivering\s*to)[:\s*]+([^\n\r*]+)/i);
  if (addrMatch && addrMatch[1].trim()) {
    deliveryAddress = addrMatch[1].trim().replace(/^[-•*]\s*/, '');
  }

  const items = [];

  // Pattern A: Multi-line Block format: "Item: <name> ... Quantity: <qty> ... Price: ₹<price>"
  const blockRegex = /(?:[-*•]\s*)?Item[:\s*]+([^\n\r*]+)[\s\S]*?(?:Quantity|Qty)[:\s*]+(\d+)(?:[\s\S]*?(?:Price|Rate)[:\s*]+(?:₹|Rs\.?)?\s*(\d+))?/gi;
  let matchA;
  while ((matchA = blockRegex.exec(text)) !== null) {
    const name = matchA[1].trim().replace(/^[-*•]\s*/, '');
    const quantity = parseInt(matchA[2], 10) || 1;
    const price = matchA[3] ? parseFloat(matchA[3]) : 0;
    items.push({
      name,
      quantity,
      price,
      total: price ? price * quantity : 0
    });
  }

  // Pattern B: Single line items e.g. "- 10x Parle-G Biscuits - ₹100" or "• Item Name x 10: ₹100"
  if (items.length === 0) {
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(?:total|delivery\s*address|address|payment|order\s*(?:summary|confirmed|placed)|reply\s*yes)/i.test(line)) continue;

      const matchB1 = line.match(/^[-*•\s]*(\d+)\s*(?:x|packs?|units?|packets?)?\s+([A-Za-z0-9\s()\-]+?)(?:\s*[:\-–=]\s*(?:₹|Rs\.?)?\s*(\d+))?$/i);
      const matchB2 = line.match(/^[-*•\s]*([A-Za-z0-9\s()\-]+?)\s*[xX]\s*(\d+)(?:\s*[:\-–=]\s*(?:₹|Rs\.?)?\s*(\d+))?$/i);

      if (matchB1 && matchB1[2]) {
        const qty = parseInt(matchB1[1], 10) || 1;
        const name = matchB1[2].trim();
        const price = matchB1[3] ? parseFloat(matchB1[3]) : 0;
        if (name.length > 2 && !/^(?:total|address|payment|order|notes)$/i.test(name)) {
          items.push({ name, quantity: qty, price: price ? price / qty : 0, total: price });
        }
      } else if (matchB2 && matchB2[1]) {
        const name = matchB2[1].trim();
        const qty = parseInt(matchB2[2], 10) || 1;
        const price = matchB2[3] ? parseFloat(matchB2[3]) : 0;
        if (name.length > 2 && !/^(?:total|address|payment|order|notes)$/i.test(name)) {
          items.push({ name, quantity: qty, price: price ? price / qty : 0, total: price });
        }
      }
    }
  }

  if (items.length === 0) {
    return null;
  }

  const priced = resolveAndPriceItems(items);
  return {
    items: priced.items,
    totalAmount: priced.totalAmount,
    deliveryAddress
  };
}

/**
 * Parses and executes model output formatted with JSON or Action tags (for compatibility / testing)
 */
export function parseOpenRouterReply(replyText, jid, resolvedPhone, defaultName, userText = '', locationData = null) {
  let cleanReply = replyText || '';
  let newOrder = null;

  // JSON Action Block (CREATE_ORDER)
  const jsonMatch = replyText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || replyText.match(/(\{\s*"action"\s*:\s*"CREATE_ORDER"[\s\S]*?\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.action === 'CREATE_ORDER' && Array.isArray(parsed.items) && parsed.items.length > 0) {
        const resolved = resolveAndPriceItems(parsed.items);
        newOrder = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: resolvedPhone,
          customerName: parsed.customerName || defaultName || 'Customer',
          deliveryAddress: (locationData ? locationData.fullDescription : '') || parsed.deliveryAddress || 'Address not specified',
          location: locationData || null,
          items: resolved.items,
          totalAmount: resolved.totalAmount,
          notes: 'Cash on Delivery'
        });
        customerCarts.delete(jid);
      }
    } catch (e) {}
  }

  // Summary text fallback
  if (!newOrder) {
    const extracted = extractOrderFromSummaryText(replyText, locationData ? locationData.fullDescription : '');
    if (extracted && extracted.items.length > 0 && /confirm/i.test(userText)) {
      newOrder = dukanOrders.createOrder({
        customerJid: jid,
        customerPhone: resolvedPhone,
        customerName: defaultName || 'Customer',
        deliveryAddress: extracted.deliveryAddress || 'Address not specified',
        location: locationData || null,
        items: extracted.items,
        totalAmount: extracted.totalAmount,
        notes: 'Cash on Delivery'
      });
      customerCarts.delete(jid);
    }
  }

  const actions = parseActionTags(replyText);
  if (actions.length > 0 && !newOrder) {
    const actResult = executeModelActions(actions, jid, defaultName, resolvedPhone, locationData);
    if (actResult.orderCreated) {
      newOrder = actResult.orderCreated;
    }
  }

  cleanReply = cleanUserFacingReply(cleanReply);
  if (newOrder) {
    cleanReply = formatOrderConfirmation(newOrder);
  }

  return { reply: cleanReply, newOrder };
}

/**
 * Constructs the dynamic, intelligent system prompt with inventory and cart context
 */
function buildDynamicSystemPrompt(customerName, cart, matchedProducts = [], lastOffered = [], userText = '') {

  let cartSummary = 'Empty';
  if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
    const lines = cart.items.map(it => `• ${it.quantity}x ${it.name} (${it.unit}) @ ₹${it.price} = ₹${it.total}`).join('\n');
    cartSummary = `${lines}\n*Total:* ₹${cart.totalAmount}\n*Delivery Address:* ${cart.deliveryAddress || 'Not set yet'}`;
  }

  let inventoryContext = '';
  const isMiniList = /\b(mini[- ]list|from this list only|from this mini[- ]list)\b/i.test(userText);
  if (!isMiniList && matchedProducts.length > 0) {
    inventoryContext = `\nRELEVANT IN-STOCK STORE ITEMS:\n` + matchedProducts.map((p, idx) => `${idx + 1}. ${p.name} (${p.unit}) – ₹${p.price}`).join('\n');
  } else if (!isMiniList && lastOffered && lastOffered.length > 0) {
    inventoryContext = `\nRECENTLY OFFERED ITEMS:\n` + lastOffered.map((p, idx) => `${idx + 1}. ${p.name} (${p.unit}) – ₹${p.price}`).join('\n');
  }

  return `You are "Dukaan", the WhatsApp ordering assistant for a neighbourhood kirana store in Jaipur, India. Customer: ${customerName || 'Customer'}.

REPLY STYLE (this goes to a phone screen):
- English only, even if they write Hindi or Hinglish.
- WhatsApp chat voice: warm, human, direct. Not a brochure, not robotic.
- Keep it under ~80 words. Never repeat their message back or re-ask what they just answered.
- At most ONE emoji per reply, and only when it adds meaning (📍 location, ✅ done). No emoji strings.
- Short lines; "•" bullets for lists; *bold* product names only.

HARD RULES:
- The CART block below is the single source of truth. NEVER print a cart, item list, subtotal or total yourself — the system appends that. Never say the cart is empty and never estimate money.
- Use only prices from CART or IN STOCK. Never invent a product or a price. If the variant is unclear, ask ONE short question.
- Item not in the catalog: say it is not available in one line, and offer a listed alternative only if one exists.
- We sell packaged groceries, staples, dairy, snacks, beverages, spices, personal care and household cleaning. No cooked food, no fresh fruit or vegetables, no alcohol or tobacco. For a cooked dish, suggest the packaged ingredients we do stock.
- Their name comes from their WhatsApp profile; if asked, say exactly that and that we only use this chat to arrange delivery.

INDIAN PHRASING: "14 rs wali maggie" = the ₹14 pack, qty 1 (NOT 14 packs). "2 kar do" = set quantity to 2. "aur ek doodh" = add one more milk. "ye hata do" = remove it. A bare number like "4" = the 4th item you last showed.

CART:
${cartSummary}
${inventoryContext}

CART ACTIONS — this is the ONLY way the cart actually changes. The tags are machine-read and never shown to the customer, so they cost you nothing:
End EVERY reply that changes the cart with the matching tag. If you say you added or changed something and omit the tag, the change does NOT happen and the customer is misled. That is the worst possible reply.
- New item: [ACTION: ADD_TO_CART name="Exact catalog name" qty=N]
- Quantity of an item ALREADY in CART: [ACTION: UPDATE_QTY name="Exact name" qty=<FINAL count>]
- Remove: [ACTION: REMOVE_ITEM name="Name"]
- Clear everything: [ACTION: CLEAR_CART]
- Save their address: [ACTION: SET_ADDRESS address="Full address text"]
- Place the order — only after they explicitly confirm: [ACTION: CONFIRM_ORDER]
- Cancel the order: [ACTION: CANCEL_ORDER]

Never re-add an item already listed in CART — that is what UPDATE_QTY is for. When the customer states a quantity ("2 maggi", "make it 3") for an item that is ALREADY in CART, that number is the FINAL quantity: use [ACTION: UPDATE_QTY ... qty=2], never add on top. Add no tag for questions, prices or browsing. Never write a tag for something you are not actually doing.

Example — customer: "2 amul milk" → reply "Adding 2 *Amul Taaza Toned Milk (500ml)*." then on a new line put: [ACTION: ADD_TO_CART name="Amul Taaza Toned Milk (500ml)" qty=2]`;
}

/**
 * Parses action tags from model reply
 */
function parseActionTags(text) {
  const actions = [];
  if (!text) return actions;

  function parseArgs(argsStr) {
    const args = {};
    const argRegex = /([a-zA-Z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\d+)|([^\s,]+))/g;
    let argMatch;
    while ((argMatch = argRegex.exec(argsStr)) !== null) {
      const key = argMatch[1];
      const val = argMatch[2] ?? argMatch[3] ?? argMatch[4] ?? argMatch[5];
      args[key] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
    }
    return args;
  }

  // Format 1: [ACTION: TYPE key="val" key=val]
  const regex1 = /\[ACTION:\s*([A-Z_]+)(?:\s+([^\]]+))?\]/gi;
  let match;
  while ((match = regex1.exec(text)) !== null) {
    actions.push({ type: match[1].toUpperCase(), args: parseArgs(match[2] || '') });
  }

  // Format 2: [action(action='TYPE', key='val', key=val)]
  const regex2 = /\[action\s*\(\s*(?:action\s*=\s*)?['"]([A-Z_]+)['"](?:\s*,\s*([^)]+))?\s*\)\]/gi;
  while ((match = regex2.exec(text)) !== null) {
    actions.push({ type: match[1].toUpperCase(), args: parseArgs(match[2] || '') });
  }

  // Format 3: [ACTION_NAME(key='val', key=val)] or <|tool_call_start|>[ACTION_NAME(...)]<|tool_call_end|>
  const regex3 = /\[(ADD_TO_CART|UPDATE_QTY|REMOVE_ITEM|CLEAR_CART|SET_ADDRESS|CONFIRM_ORDER|CANCEL_ORDER)\s*\(([\s\S]*?)\)\]/gi;
  while ((match = regex3.exec(text)) !== null) {
    actions.push({ type: match[1].toUpperCase(), args: parseArgs(match[2] || '') });
  }

  return actions;
}

/**
 * Removes any cart/total block the MODEL wrote into its own reply.
 *
 * The engines append a single authoritative cart footer built from the real cart
 * state. If the model also prints its own cart (from the stale pre-action state
 * it was given), the customer sees two contradicting carts in one message —
 * e.g. "cart is empty" followed by "2x ₹28", or "2x ₹28" followed by "4x ₹56".
 * Cutting the model's block makes that contradiction structurally impossible.
 */
export function stripModelCartBlock(reply) {
  if (!reply) return '';
  const cut = reply.search(
    /^[ \t*_•-]*(?:current cart|cart summary|cart total|your cart|cart|subtotal|total)\s*[:\-–]/im
  );
  return (cut >= 0 ? reply.slice(0, cut) : reply)
    .split('\n')
    // Drop receipt-style lines the model wrote itself (the engine appends the real ones).
    .filter(line => !/^\s*[•*-]\s*\d+\s*x\s+.+?\s*@\s*₹/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Reply shown right after the customer shares their location pin. */
export function buildLocationAck(shop, location) {
  const area = String((location && (location.name || location.address)) || 'your area').slice(0, 60);
  const name = (shop && shop.shopName) || 'your nearest store';
  const dist = shop && Number.isFinite(shop.distanceKm) ? ` (${shop.distanceKm.toFixed(1)} km away)` : '';
  return `Got it — ${area}.

You are connected to ${name}${dist}. Tell me what you need and I will get it packed.`;
}

/** Single source of truth for the order-placed message (all engines use this). */
export function formatOrderConfirmation(order) {
  if (!order) return '';
  const items = (order.items || [])
    .map(it => `• ${it.quantity}x ${it.name} @ ₹${it.price} = ₹${it.total}`)
    .join('\n');
  return `Order placed — #${order.id}\n\n${items}\n\nTotal: ₹${order.totalAmount} (cash or UPI on delivery)\nAddress: ${order.deliveryAddress}\n\nThe shopkeeper is checking it now. I will message you the moment it is accepted.`;
}

/**
 * Cleans tool tags and action tags from user-facing reply
 */
function cleanUserFacingReply(raw) {
  if (!raw) return '';
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
    .replace(/<\|[\s\S]*?\|>/g, '')
    .replace(/\[ACTION:[\s\S]*?\]/gi, '')
    .replace(/\[action\([\s\S]*?\)\]/gi, '')
    .replace(/\[(?:ADD_TO_CART|UPDATE_QTY|REMOVE_ITEM|CLEAR_CART|SET_ADDRESS|CONFIRM_ORDER|CANCEL_ORDER)\s*\([\s\S]*?\)\]/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim();
}

/**
 * Executes parsed model action tags deterministically
 */
function executeModelActions(actions, jid, pushName, phone, locationData) {
  let cart = customerCarts.get(jid) || {
    items: [],
    totalAmount: 0,
    customerName: pushName || 'Customer',
    deliveryAddress: locationData ? locationData.fullDescription : '',
    location: locationData || null,
    updatedAt: Date.now(),
    status: 'staged'
  };

  let cartUpdated = false;
  let orderCreated = null;
  let orderCancelled = false;

  for (const act of actions) {
    if (act.type === 'ADD_TO_CART' && act.args.name) {
      const matches = dukanCatalog.search(String(act.args.name));
      const p = matches.length > 0 ? matches[0] : null;
      const qty = Math.max(1, parseInt(act.args.qty, 10) || 1);
      if (p) {
        const existing = cart.items.find(it => it.id === p.id);
        if (existing) {
          existing.quantity += qty;
          existing.total = existing.price * existing.quantity;
        } else {
          cart.items.push({
            id: p.id,
            name: p.name,
            category: p.category,
            price: p.price,
            unit: p.unit,
            quantity: qty,
            total: p.price * qty
          });
        }
        cartUpdated = true;
      } else {
        const name = String(act.args.name);
        cart.items.push({
          id: 'custom-' + Date.now(),
          name,
          category: 'Grocery',
          price: parseInt(act.args.price, 10) || 30,
          unit: 'unit',
          quantity: qty,
          total: (parseInt(act.args.price, 10) || 30) * qty
        });
        cartUpdated = true;
      }
    } else if (act.type === 'UPDATE_QTY' && act.args.name) {
      const q = String(act.args.name).toLowerCase();
      const existing = cart.items.find(it => it.name.toLowerCase().includes(q) || q.includes(it.name.toLowerCase()));
      const qty = parseInt(act.args.qty, 10) || 0;
      if (existing) {
        if (qty <= 0) {
          cart.items = cart.items.filter(it => it.id !== existing.id);
        } else {
          existing.quantity = qty;
          existing.total = existing.price * qty;
        }
        cartUpdated = true;
      }
    } else if (act.type === 'REMOVE_ITEM' && act.args.name) {
      const q = String(act.args.name).toLowerCase();
      cart.items = cart.items.filter(it => !it.name.toLowerCase().includes(q) && !q.includes(it.name.toLowerCase()));
      cartUpdated = true;
    } else if (act.type === 'CLEAR_CART') {
      cart.items = [];
      cart.totalAmount = 0;
      cartUpdated = true;
    } else if (act.type === 'SET_ADDRESS' && act.args.address) {
      cart.deliveryAddress = String(act.args.address).trim();
      cartUpdated = true;
    } else if (act.type === 'CONFIRM_ORDER') {
      if (cart.items.length > 0) {
        orderCreated = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: phone,
          customerName: cart.customerName || pushName || 'Customer',
          deliveryAddress: cart.deliveryAddress || (locationData ? locationData.fullDescription : 'Address not specified'),
          location: locationData || cart.location || null,
          items: cart.items,
          totalAmount: cart.totalAmount,
          notes: 'Cash on Delivery'
        });
        customerCarts.delete(jid);
        return { cartUpdated: false, orderCreated, cart: null };
      }
    } else if (act.type === 'CANCEL_ORDER') {
      customerCarts.delete(jid);
      dukanOrders.cancelOrderByCustomer(phone || jid);
      orderCancelled = true;
      return { cartUpdated: false, orderCreated: null, orderCancelled: true, cart: null };
    }
  }

  if (cartUpdated) {
    cart.totalAmount = cart.items.reduce((s, it) => s + (it.total || (it.price * it.quantity)), 0);
    cart.updatedAt = Date.now();
    customerCarts.set(jid, cart);
  }

  return { cartUpdated, orderCreated, orderCancelled, cart };
}

/**
 * Pulls the quantity the customer actually said for a product, e.g.
 * "add 2 maggi ₹14 pack" -> 2, "maggi 2 kar do" -> 2, "maggi ₹14" -> 0 (unstated).
 * Only numbers adjacent to the product, or a bare small number, are considered —
 * a price like ₹14 must never be read as a quantity.
 */
export function extractStatedQuantity(text, product) {
  const keys = [product.name, ...(product.keywords || [])]
    .map(k => String(k).trim().split(/\s+/)[0])
    .filter(Boolean);
  for (const key of keys) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = new RegExp(`\\b(\\d{1,2})\\s*(?:x\\s*)?${esc}\\b`, 'i').exec(text);
    if (before) return parseInt(before[1], 10);
    const after = new RegExp(`\\b${esc}\\b\\s*(?:x\\s*)?(\\d{1,2})\\b`, 'i').exec(text);
    if (after) return parseInt(after[1], 10);
  }
  const bare = /(?<!₹\s?)\b(\d{1,2})\b(?!\s*%)/.exec(text);
  return bare ? parseInt(bare[1], 10) : 0;
}

/** Cheap check that a line is a delivery address rather than a chat message. */
export function looksLikeAddress(text) {
  return /\b(house|flat|plot|street|st\.?|road|rd|lane|gali|nagar|colony|sector|block|marg|apartment|tower|mohalla|village)\b/i.test(text)
    || /\b\d{6}\b/.test(text)
    || /\d+\s*,\s*\w+/.test(text);
}

/**
 * Did the customer actually name this product? The brand token (first word of
 * the catalog name) must appear as a whole word. Without this gate, the catalog
 * search matches on generic words inside product names — "just 2 maggi total"
 * once matched "Lifebuoy *Total* 10 Soap".
 */
export function mentionsProduct(text, product) {
  const first = String(product.name || '').trim().split(/\s+/)[0] || '';
  const tokens = [first, first.split('-')[0]]
    .map(t => t.replace(/[^a-z0-9]/gi, ''))
    .filter(t => t.length >= 3);
  const hay = String(text).toLowerCase();
  return tokens.some(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay));
}

/**
 * Safety net under the AI layer.
 *
 * A text-only model occasionally DESCRIBES a cart or address change without
 * emitting the matching action tag. The customer is then told something
 * happened that did not — for an ordering bot that means a wrong cart, or an
 * order shipped to "Address not specified" (both seen in real testing).
 *
 * So when a turn claims a change but carries no tag, we re-read the customer's
 * own words and apply it deterministically. A quantity stated for an item that
 * is ALREADY in the cart is treated as the FINAL quantity, never an addition —
 * that is what customers mean, and it is what stops "2 became 4".
 */
export function reconcileMissedActions(userText, narrative, actions, jid, pushName, phone, locationData) {
  const hasCartAction = actions.some(a =>
    ['ADD_TO_CART', 'UPDATE_QTY', 'REMOVE_ITEM', 'CLEAR_CART'].includes(a.type)
  );
  const hasAddressAction = actions.some(a => a.type === 'SET_ADDRESS');

  const asksPermission = /\?|shall i|would you like|do you want|should i/i.test(narrative);
  const inferred = [];

  if (!hasCartAction && !asksPermission && /\b(add|added|adding|update|updated|updating)\b/i.test(narrative)) {
    const cart = customerCarts.get(jid);
    // One pick per product the customer actually named: results are ranked, so
    // variants of the same product ("Maggi 70g", "Maggi 4-pack") share keywords
    // and collapse into a single, best-ranked match.
    const picked = [];
    for (const product of dukanCatalog.search(userText)) {
      if (!mentionsProduct(userText, product)) continue;
      const keys = [...(product.keywords || []), product.name].map(k => String(k).toLowerCase());
      const alreadyCovered = picked.some(p =>
        [...(p.keywords || []), p.name].map(k => String(k).toLowerCase()).some(k => keys.includes(k))
      );
      if (alreadyCovered) continue;
      picked.push(product);
      if (picked.length >= 3) break;
    }

    for (const product of picked) {
      const inCart = Boolean(cart && cart.items.some(it => it.id === product.id));
      inferred.push({
        type: inCart ? 'UPDATE_QTY' : 'ADD_TO_CART',
        args: { name: product.name, qty: extractStatedQuantity(userText, product) || 1 },
      });
    }
  }

  if (!hasAddressAction && looksLikeAddress(userText) && /\b(address|saving|saved|noted|deliver)\b/i.test(narrative)) {
    inferred.push({ type: 'SET_ADDRESS', args: { address: String(userText).trim() } });
  }

  if (inferred.length === 0) return null;
  console.log(`[Dukan Bot] Reconciled ${inferred.map(a => a.type).join(', ')} (model omitted the tag)`);
  return executeModelActions(inferred, jid, pushName, phone, locationData);
}

/** The single cart block appended to a reply after the cart changes. */
function formatCartFooter(cart) {
  const items = cart.items.map(it => `• ${it.quantity}x ${it.name} @ ₹${it.price} = ₹${it.total}`).join('\n');
  const addr = cart.deliveryAddress
    ? `Address: ${cart.deliveryAddress}`
    : `Send your address (or a location pin) to finish.`;
  return `\n\n${items}\nTotal: ₹${cart.totalAmount}\n${addr}\n\nReply CONFIRM to place the order.`;
}

/**
 * Stores a short, narrative-only transcript.
 *
 * Cart footers are stripped before storing (they are regenerated on the way
 * out). Letting them into the transcript made the model echo last turn's stale
 * cart, which is what produced "2x ₹28 in the words, 4x ₹56 in the footer".
 * The length caps also keep the input tokens per turn small.
 */
function rememberTurn(jid, userText, reply) {
  const history = conversationHistories.get(jid) || [];
  history.push({ role: 'user', content: String(userText || '').slice(0, 200) });
  history.push({ role: 'assistant', content: String(stripModelCartBlock(reply) || '').slice(0, 400) });
  conversationHistories.set(jid, history.slice(-6));
}

/**
 * Calls AI completions: Groq (Qwen 3.8 27B) as PRIMARY, OpenRouter as SECONDARY, Local SLM as FALLBACK.
 */
async function callAiEngine(userText, customerName, customerPhone, jid, locationData = null) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const groqModel = (process.env.GROQ_MODEL || 'qwen/qwen3.8-27b').trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const openRouterModel = (process.env.OPENROUTER_MODEL || 'liquid/lfm-2.5-2.6b:free').trim();

  const cart = customerCarts.get(jid) || null;
  const history = conversationHistories.get(jid) || [];
  
  const isMiniListPrompt = /\b(mini[- ]list|from this list only|from this mini[- ]list)\b/i.test(userText);
  const matchedProducts = !isMiniListPrompt ? dukanCatalog.search(userText).slice(0, 6) : [];
  const lastOffered = (lastOfferedItems.get(jid) || []).slice(0, 4);

  const systemPrompt = buildDynamicSystemPrompt(customerName, cart, matchedProducts, lastOffered, userText);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: userText }
  ];

  let rawReply = null;

  // PRIMARY: Groq (Qwen 3.8 27B)
  if (groqKey && groqKey !== 'placeholder') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          temperature: 0.6,
          max_completion_tokens: 800,
          top_p: 0.95,
          reasoning_effort: 'default'
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          console.log(`[AI Engine] Reply generated via Groq (${groqModel})`);
          rawReply = content.trim();
        }
      } else {
        console.warn(`[AI Engine] Groq HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.warn(`[AI Engine] Groq error (${e.message})`);
    }
  }

  // SECONDARY: OpenRouter Free Models
  if (!rawReply && openRouterKey && openRouterKey !== 'placeholder') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5001',
          'X-Title': 'Dukaan WhatsApp Bot'
        },
        body: JSON.stringify({
          model: openRouterModel,
          models: Array.from(new Set([openRouterModel, 'nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3.5-lightning:free'])).slice(0, 3),
          messages,
          temperature: 0.5,
          max_tokens: 600
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          console.log(`[AI Engine] Reply generated via OpenRouter (${openRouterModel})`);
          rawReply = content.trim();
        }
      } else {
        console.warn(`[AI Engine] OpenRouter HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.warn(`[AI Engine] OpenRouter error (${e.message})`);
    }
  }

  // FALLBACK: Local SLM (Port 8080)
  if (!rawReply) {
    try {
      const localBaseUrl = process.env.LLM_BASE_URL || 'http://127.0.0.1:8080/v1/chat/completions';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(localBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_tokens: 500,
          temperature: 0.5
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          console.log(`[AI Engine] Reply generated via Local SLM fallback`);
          rawReply = content.trim();
        }
      }
    } catch (e) {
      console.warn(`[AI Engine] Local SLM fallback error (${e.message})`);
    }
  }

  if (!rawReply) return null;

  const rawClean = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Parse & execute action tags. The cart is mutated here from the REAL state.
  const actions = parseActionTags(rawClean);
  const modelResult = executeModelActions(actions, jid, customerName, customerPhone, locationData);
  let { cartUpdated, orderCreated, cart: currentCart } = modelResult;

  // The model's own words, with any cart block it wrote itself removed.
  let narrative = stripModelCartBlock(cleanUserFacingReply(rawClean));

  // Safety net: the model described a change but forgot the tag (common). Apply it.
  if (!orderCreated) {
    const reconciled = reconcileMissedActions(userText, narrative, actions, jid, customerName, customerPhone, locationData);
    if (reconciled) {
      cartUpdated = cartUpdated || reconciled.cartUpdated;
      orderCreated = reconciled.orderCreated || orderCreated;
      currentCart = reconciled.cart || currentCart;
    }
  }

  // Order placed via CONFIRM_ORDER: one canonical confirmation, nothing else.
  if (orderCreated) {
    const reply = formatOrderConfirmation(orderCreated);
    rememberTurn(jid, userText, reply);
    return { reply, newOrder: orderCreated };
  }

  const setAddrAct = actions.find(a => a.type === 'SET_ADDRESS');
  if (setAddrAct && !narrative) {
    narrative = `Address saved: ${currentCart?.deliveryAddress || setAddrAct.args.address}`;
  }
  if (!narrative) {
    narrative = cartUpdated ? 'Added to your cart.' : 'Got it — what else do you need?';
  }

  // Append the ONE authoritative cart block, built from the real cart state.
  let reply = narrative;
  if (cartUpdated && currentCart && currentCart.items.length > 0) {
    reply += formatCartFooter(currentCart);
  }

  rememberTurn(jid, userText, reply);
  return { reply, newOrder: null };
}

export const dukanBot = {
  /**
   * Trigger gate used by the WhatsApp server: only engage when the message
   * carries "/hey" or the chat has a live (12-min idle) session.
   */
  shouldEngage(jid, text, now = Date.now()) {
    return shouldEngage(jid, text, now);
  },

  /**
   * Closes the ordering chat immediately. The server calls this when the
   * shopkeeper app finishes an order (doorstep / delivered / rejected) or the
   * customer cancels, so the bot stops answering that thread instead of waiting
   * out the 12-minute idle window.
   */
  endSession(jid) {
    endSession(jid);
  },

  /** True while the chat is waiting for the customer's location pin. */
  isAwaitingLocation(jid) {
    return isAwaitingLocation(jid);
  },

  /**
   * Main entry point.
   *
   * FLOW (kept in this order on purpose):
   *   1. "/hey"       -> beginLocationHandshake, reply WELCOME_REPLY (no AI call)
   *   2. awaiting pin -> pin: match nearest shop, reply ack, chat is now live
   *                      text: LOCATION_HOWTO_REPLY (no AI call)
   *   3. live chat    -> deterministic confirm/cancel, else callAiEngine()
   *
   * Powered dynamically by Groq (primary) with OpenRouter free models and a
   * local SLM as automatic fallbacks.
   */
  async handleMessage(msg, sock, locationData = null) {
    const jid = msg.remoteJid;
    let text = (msg.text || '').trim();
    const pushName = msg.pushName || '';
    const phone = msg.from || resolvePhoneNumber(jid);

    // Keep the engaged chat warm (sliding idle window)
    activateSession(jid, Date.now());

    // "/hey" trigger. Ordering needs a location pin first (the pin decides which
    // store serves them), so the trigger only opens the handshake — no AI call.
    // Anything typed with it ("/hey 2 maggi") is held and replayed once the pin
    // arrives, so it is never silently dropped.
    if (isBotTrigger(text)) {
      beginLocationHandshake(jid, stripBotTrigger(text));
      return { reply: WELCOME_REPLY, newOrder: null };
    }

    // Handshake: waiting for the location pin.
    if (isAwaitingLocation(jid)) {
      if (locationData) {
        const shop = matchNearestShop(locationData);
        const pending = completeLocationHandshake(jid, shop);
        console.log(
          `[Dukan Bot] ${jid} -> shop "${shop?.shopName}"` +
            (shop?.distanceKm != null ? ` (${shop.distanceKm.toFixed(1)} km away)` : ' (no shop registry yet, local fallback)')
        );
        const ack = buildLocationAck(shop, locationData);
        if (pending) {
          // Replay what they typed with /hey now that the store is known.
          const aiResult = await callAiEngine(pending, pushName, phone, jid, locationData);
          if (aiResult?.reply) {
            return { reply: `${ack}\n\n${aiResult.reply}`, newOrder: aiResult.newOrder };
          }
        }
        return { reply: ack, newOrder: null };
      }

      // They texted instead of sharing a pin: walk them through it. No AI call,
      // so this is free and can repeat patiently.
      return { reply: LOCATION_HOWTO_REPLY, newOrder: null };
    }

    // Location pin received without explicit message text
    if (!text && locationData) {
      text = `My delivery location is: ${locationData.fullDescription}`;
    }

    if (!text && !locationData) return null;

    // Security & Credential Leak Guards
    if (/\b(VITE_|SUPABASE|ANON_KEY|API_KEY|SECRET_KEY|DATABASE_URL|GITHUB_TOKEN|system prompt|ignore previous|prompt leak|SELECT\s+.*FROM|DROP\s+TABLE|INSERT\s+INTO)\b/i.test(text)) {
      return {
        reply: `This is a WhatsApp grocery ordering bot for Dukaan. For security, please do not share credentials or technical secrets in chat. Let me know what groceries you need!`,
        newOrder: null
      };
    }

    // Punctuation / Dot-only Pings
    if (/^[.\s\-?_!,]+$/.test(text.trim())) {
      return {
        reply: `What would you like to order?`,
        newOrder: null
      };
    }

    // Explicit confirmation fallback: if customer sends a short explicit confirm ("confirm", "ha bhej do") and cart already has items
    const isExplicitConfirm = (
      /^(?:confirm|yes|ha|haan|proceed|order|pack kar do|bhej do|haan bhej do)[\s.!,]*$/i.test(text.trim())
    );
    if (isExplicitConfirm) {
      const cart = customerCarts.get(jid);
      if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
        const order = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: phone,
          customerName: cart.customerName || pushName || 'Customer',
          deliveryAddress: cart.deliveryAddress || (locationData ? locationData.fullDescription : 'Address not specified'),
          location: locationData || cart.location || null,
          items: cart.items,
          totalAmount: cart.totalAmount,
          notes: 'Cash on Delivery'
        });
        customerCarts.delete(jid);
        conversationHistories.delete(jid);
        return { reply: formatOrderConfirmation(order), newOrder: order };
      }
    }

    // Explicit cancellation: if customer sends a short explicit cancellation ("cancel", "cancel order", "rehne do")
    const isExplicitCancel = /^(?:cancel|cancel order|order cancel|rehne do|mat bhejo)[\s.!,]*$/i.test(text.trim());
    if (isExplicitCancel) {
      customerCarts.delete(jid);
      conversationHistories.delete(jid);
      dukanOrders.cancelOrderByCustomer(phone || jid);
      return {
        reply: `Cancelled. Nothing will be dispatched and no payment is due.`,
        newOrder: null
      };
    }

    // DYNAMIC AI BRAIN: Let the AI model think, reason, and answer dynamically!
    try {
      const aiResult = await callAiEngine(text, pushName, phone, jid, locationData);
      if (aiResult) {
        return aiResult;
      }
    } catch (e) {
      console.warn(`[AI Engine] Execution error (${e.message})`);
    }

    return {
      reply: `I can help you check grocery prices, explore categories, or take an order. What items would you like today?`,
      newOrder: null
    };
  }
};
