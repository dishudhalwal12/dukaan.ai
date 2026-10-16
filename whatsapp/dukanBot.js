import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dukanCatalog, resolveCatalogItem, searchInCatalog } from './dukanCatalog.js';
import { dukanOrders } from './dukanOrders.js';
import { matchNearestShop, loadShops } from './dukanShops.js';
import { registryStatus, loadShopCatalog } from './dukanCloud.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Existing environment variables WIN over .env (dotenv's default): the process
// environment is the explicit, higher-precedence channel — a test pins it, a
// shell export sets it, a platform injects it. With `override: true` a developer's
// .env silently beat all three, which is how the test suite once inherited live
// Supabase credentials and read the real registry.
dotenv.config({ path: path.resolve(__dirname, '.env') });

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

// Shown when the store directory cannot be reached. We refuse to order rather
// than guess an owner or a shop on a shared backend.
export const SERVICE_UNAVAILABLE_REPLY = `I can't reach the store directory right now, so I can't place an order this moment.

Please try again in a minute — send /hey and share your location again.`;

// Shown when the shop has not listed any items yet.
export const NO_ITEMS_REPLY = `That store hasn't listed any items yet, so there's nothing to order from it right now.

Send /hey with your location if you'd like me to look for another store nearby.`;

// Shown when a customer tries to confirm an order with no store connected.
export const NOT_CONNECTED_REPLY = `I can't place that order yet — I don't have a store connected to your location.

Send /hey and share your location pin and I'll route your order to the nearest store.`;

/** The reply when no shop can serve this location (no guessing, no order). */
export function noShopReply(match) {
  if (match?.reason === 'out-of-range' && Number.isFinite(match.nearestKm)) {
    return `Sorry — no store in our network delivers to your area yet. The nearest one is about ${match.nearestKm.toFixed(1)} km away.

Nothing has been ordered. You can try a location closer to the store.

Send /hey with a different location to try again.`;
  }
  return `Sorry — there's no Dukaan store serving your area right now, so I can't take an order.

Nothing has been ordered.

Send /hey with your location to try again later.`;
}

// jid -> last activity timestamp (ms)
const activeSessions = new Map();

// Onboarding handshake: "/hey" opens the chat, but ordering only starts once the
// customer shares a location pin (that pin decides WHICH store serves them).
const awaitingLocations = new Set();  // jids that sent /hey and still need a pin
const pendingRequests = new Map();    // jid -> text typed alongside /hey
export const activeShops = new Map(); // jid -> shop matched from their location

// Remembered delivery location per customer: jid -> { value, at }.
// A customer shares ONE pin. Every later turn must reuse it and the final order
// must carry it, so the bot never asks for the address a second time. Keyed by
// jid (never by shop) because one WhatsApp number serves many shops.
export const customerLocations = new Map();

/** Remembers the delivery location for this customer (no-op without a pin). */
export function rememberLocation(jid, locationData, now = Date.now()) {
  if (!jid || !locationData) return;
  customerLocations.set(jid, { value: locationData, at: now });
}

/**
 * The delivery location to use for this customer: an explicit pin wins, else the
 * remembered one, else null. A remembered pin older than the idle window is
 * evicted and ignored — a lapsed chat must not reuse a stale address.
 */
export function locationFor(jid, locationData = null, now = Date.now()) {
  if (locationData) return locationData;
  const entry = jid ? customerLocations.get(jid) : null;
  if (!entry) return null;
  if (now - entry.at > SESSION_IDLE_TTL_MS) {
    customerLocations.delete(jid);
    return null;
  }
  return entry.value;
}

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
 * End a conversation for good: a refusal (no shop / unreachable registry / empty
 * catalog) or a placed order means there is nothing left to say, and a chat that
 * stays engaged keeps running the model on every message the customer sends and
 * bills for it. The customer starts again with "/hey".
 */
function closeConversation(jid) {
  if (!jid) return;
  endSession(jid);
  clearLocationHandshake(jid);
  conversationHistories.delete(jid);
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
  customerLocations.delete(jid); // a new order starts fresh — no stale address
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
  // A pin that matches no shop must not leave a stale shop (or a stale owner)
  // attached to this customer.
  if (shop) activeShops.set(jid, shop);
  else activeShops.delete(jid);
  const pending = pendingRequests.get(jid) || '';
  pendingRequests.delete(jid);
  return pending;
}

export function clearLocationHandshake(jid) {
  awaitingLocations.delete(jid);
  pendingRequests.delete(jid);
}

/**
 * The account that owns the shop serving this customer, or null when no shop
 * has been matched yet. Stamped onto every order the bot creates so the order
 * reaches exactly one shopkeeper — never all of them.
 */
export function ownerForCustomer(jid) {
  return activeShops.get(jid)?.userId || null;
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
  customerLocations.clear();
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
 * The catalog that applies to this customer: the matched shop's own catalog, and
 * nothing else. A customer with no connected shop cannot order anything — that is
 * what stops an unrouted (and therefore unowned) order from ever being created.
 */
export function catalogForCustomer(jid) {
  const shop = activeShops.get(jid);
  return Array.isArray(shop?.catalog) ? shop.catalog : [];
}

/**
 * The single choke point for creating an order.
 *
 * An order with no owner is visible to nobody on a shared backend, so it is never
 * created: the pipeline fails closed and the customer is told why.
 * @returns the order, or null when this customer has no shop.
 */
function createOwnedOrder(jid, fields) {
  const userId = ownerForCustomer(jid);
  if (!userId) {
    console.warn(`[Dukan Bot] Refusing to create an order for ${jid}: no shop is connected.`);
    return null;
  }
  const order = dukanOrders.createOrder({ ...fields, userId });
  // Every order-creation path funnels through here, so this is the one place that
  // has to end the conversation once an order exists.
  if (order) closeConversation(jid);
  return order;
}

/** True when a shop (with a catalog) is connected for this customer. */
export function hasConnectedShop(jid) {
  const shop = activeShops.get(jid);
  return Boolean(shop && shop.userId);
}

/**
 * Deterministic Order Resolver & Pricing Engine.
 * Matches requested item names against a catalog, retrieves authoritative prices,
 * computes item totals, and calculates the true order total.
 *
 * An item the catalog does not contain is DROPPED — it is never priced from the
 * model's own number (that is how a hallucinated ₹30 line used to reach an order).
 */
export function resolveAndPriceItems(rawItems, catalog = null) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: [], totalAmount: 0 };
  }

  const products = catalog || dukanCatalog.getAll();
  const verifiedItems = [];

  for (const raw of rawItems) {
    if (!raw) continue;
    let query = String(raw.name || raw.query || raw.item || '').trim();
    query = query.replace(/\([^\)]+\)/g, '').replace(/product_/g, '').trim();
    const qty = Math.max(1, parseInt(raw.quantity || raw.qty, 10) || 1);

    const match = resolveCatalogItem(products, query);
    if (match.status === 'ok') {
      const matched = match.product;
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
    }
    // No else: an unmatched item is dropped, never priced from the model's guess.
  }

  const totalAmount = verifiedItems.reduce((sum, it) => sum + (it.total || 0), 0);
  return { items: verifiedItems, totalAmount };
}

/**
 * Extracts order details from summary text (for compatibility / testing)
 */
export function extractOrderFromSummaryText(text, defaultAddress = '', catalog = null) {
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

  const priced = resolveAndPriceItems(items, catalog);
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
        const resolved = resolveAndPriceItems(parsed.items, catalogForCustomer(jid));
        // An order with nothing in it is not an order: every requested item was
        // dropped by the gate (nothing this shop stocks was asked for).
        if (resolved.items.length > 0) {
          newOrder = createOwnedOrder(jid, {
            customerJid: jid,
            customerPhone: resolvedPhone,
            customerName: parsed.customerName || defaultName || 'Customer',
            deliveryAddress: (locationData ? locationData.fullDescription : '') || parsed.deliveryAddress || 'Address not specified',
            location: locationData || null,
            items: resolved.items,
            totalAmount: resolved.totalAmount,
            notes: 'Cash on Delivery'
          });
          if (newOrder) customerCarts.delete(jid);
        }
      }
    } catch (e) {}
  }

  // Summary text fallback
  if (!newOrder) {
    const extracted = extractOrderFromSummaryText(replyText, locationData ? locationData.fullDescription : '', catalogForCustomer(jid));
    if (extracted && extracted.items.length > 0 && /confirm/i.test(userText)) {
      newOrder = createOwnedOrder(jid, {
        customerJid: jid,
        customerPhone: resolvedPhone,
        customerName: defaultName || 'Customer',
        deliveryAddress: extracted.deliveryAddress || 'Address not specified',
        location: locationData || null,
        items: extracted.items,
        totalAmount: extracted.totalAmount,
        notes: 'Cash on Delivery'
      });
      if (newOrder) customerCarts.delete(jid);
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

// Above this many items the catalog is summarised (matching items + categories)
// instead of inlined, to keep the prompt small. A merchant catalog is normally
// far below it, so the model sees the full, authoritative list.
const CATALOG_INLINE_LIMIT = 40;

/**
 * Renders the authoritative item list for the prompt.
 *
 * This is the ONLY place a prompt may get items from: `callAiEngine` passes the
 * served shop's catalog. The global catalog used to leak in here, so the model was
 * shown (and confidently offered) items the serving shop does not stock — the
 * reported "I have Lifeboy soap at ₹30 … sorry, this store does not have it".
 */
function renderStoreCatalog(catalog, userText) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return 'No store is connected to this customer yet, so there is nothing to order.';
  }

  const line = (p) => `- ${p.name} (${p.unit || 'unit'}) – ₹${p.price}`;

  if (catalog.length <= CATALOG_INLINE_LIMIT) {
    return catalog.map(line).join('\n');
  }

  const categories = [...new Set(catalog.map(p => p.category).filter(Boolean))];
  const matches = searchInCatalog(catalog, userText).slice(0, 10);
  return [
    `This store stocks ${catalog.length} items across: ${categories.join(', ')}.`,
    matches.length > 0
      ? 'Items matching this request:\n' + matches.map(line).join('\n')
      : 'Nothing in this store matches the request.'
  ].join('\n');
}

/**
 * Constructs the dynamic system prompt: the store's own catalog + the live cart.
 * Both are inputs; the prompt never sources either from anywhere else.
 */
export function buildDynamicSystemPrompt(customerName, cart, catalog = [], userText = '') {

  let cartSummary = 'Empty';
  if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
    const lines = cart.items.map(it => `• ${it.quantity}x ${it.name} (${it.unit}) @ ₹${it.price} = ₹${it.total}`).join('\n');
    cartSummary = `${lines}\n*Total:* ₹${cart.totalAmount}\n*Delivery Address:* ${cart.deliveryAddress || 'Not set yet'}`;
  }

  const storeCatalog = renderStoreCatalog(catalog, userText);

  return `You are "Dukaan", the WhatsApp ordering assistant for a neighbourhood kirana store in Jaipur, India. Customer: ${customerName || 'Customer'}.

REPLY STYLE (this goes to a phone screen):
- English only, even if they write Hindi or Hinglish.
- WhatsApp chat voice: warm, human, direct. Not a brochure, not robotic.
- Keep it under ~80 words. Never repeat their message back or re-ask what they just answered.
- At most ONE emoji per reply, and only when it adds meaning (📍 location, ✅ done). No emoji strings.
- Short lines; "•" bullets for lists; *bold* product names only.

STORE CATALOG — the ONLY items this store sells:
${storeCatalog}

HARD RULES:
- Sell ONLY what STORE CATALOG lists. If an item is not printed there, this store does not have it: say so in one line and offer a listed alternative only if one genuinely exists. Never answer that you will "check", "look for", "find out" or "order it in".
- Never name a product, brand, size or price that is not printed in STORE CATALOG — not even one you know from other shops. A price you did not read there does not exist.
- The CART block below is the single source of truth for what is being ordered. NEVER print a cart, item list, subtotal or total yourself — the system appends that. Never say the cart is empty and never estimate money.
- If the customer's wording could mean two different listings in STORE CATALOG, ask ONE short question.
- Their name comes from their WhatsApp profile; if asked, say exactly that and that we only use this chat to arrange delivery.

INDIAN PHRASING: "14 rs wali" = the ₹14 listing, qty 1 (NOT 14 packs). "2 kar do" = set quantity to 2. "aur ek doodh" = add one more milk. "ye hata do" = remove it. A bare number like "4" = the 4th item you last showed.

CART:
${cartSummary}

CART ACTIONS — this is the ONLY way the cart actually changes. The tags are machine-read and never shown to the customer, so they cost you nothing:
End EVERY reply that changes the cart with the matching tag. If you say you added or changed something and omit the tag, the change does NOT happen and the customer is misled. That is the worst possible reply.
- New item: [ACTION: ADD_TO_CART name="Exact catalog name" qty=N]
- Quantity of an item ALREADY in CART: [ACTION: UPDATE_QTY name="Exact name" qty=<FINAL count>]
- Remove: [ACTION: REMOVE_ITEM name="Name"]
- Clear everything: [ACTION: CLEAR_CART]
- Save their address: [ACTION: SET_ADDRESS address="Full address text"]
- Place the order — only after they explicitly confirm: [ACTION: CONFIRM_ORDER]
- Cancel the order: [ACTION: CANCEL_ORDER]

Never re-add an item already listed in CART — that is what UPDATE_QTY is for. When the customer states a quantity ("2 of it", "make it 3") for an item that is ALREADY in CART, that number is the FINAL quantity: use [ACTION: UPDATE_QTY ... qty=2], never add on top. Add no tag for questions, prices or browsing. Never write a tag for something you are not actually doing.

Example — the customer asks for two of a listing in STORE CATALOG → reply "Adding 2 *<that listing's exact name>*." then on a new line put: [ACTION: ADD_TO_CART name="<that listing's exact name>" qty=2]`;
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
 * Executes parsed model action tags deterministically.
 *
 * ADD_TO_CART is gated by the customer's catalog: a stocked item is added at the
 * shop's authoritative price, an unknown item is dropped (`unavailable`), and a
 * genuinely ambiguous one is not guessed (`clarifications`) — the caller turns
 * those into a rebuilt reply.
 */
export function executeModelActions(actions, jid, pushName, phone, locationData, catalog = null) {
  const products = catalog || catalogForCustomer(jid);
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
  const unavailable = [];
  const clarifications = [];

  for (const act of actions) {
    if (act.type === 'ADD_TO_CART' && act.args.name) {
      const requested = String(act.args.name);
      const resolution = resolveCatalogItem(products, requested);
      const qty = Math.max(1, parseInt(act.args.qty, 10) || 1);
      if (resolution.status === 'ambiguous') {
        // Never guess between genuinely distinct products.
        clarifications.push({ name: requested, options: resolution.options });
        continue;
      }
      if (resolution.status === 'missing') {
        unavailable.push(requested);
        continue;
      }
      const p = resolution.product;
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
        orderCreated = createOwnedOrder(jid, {
          customerJid: jid,
          customerPhone: phone,
          customerName: cart.customerName || pushName || 'Customer',
          deliveryAddress: cart.deliveryAddress || (locationData ? locationData.fullDescription : 'Address not specified'),
          location: locationData || cart.location || null,
          items: cart.items,
          totalAmount: cart.totalAmount,
          notes: 'Cash on Delivery'
        });
        if (orderCreated) customerCarts.delete(jid);
        return { cartUpdated: false, orderCreated, cart: orderCreated ? null : cart, unavailable, clarifications };
      }
    } else if (act.type === 'CANCEL_ORDER') {
      customerCarts.delete(jid);
      dukanOrders.cancelOrderByCustomer(phone || jid);
      orderCancelled = true;
      return { cartUpdated: false, orderCreated: null, orderCancelled: true, cart: null, unavailable, clarifications };
    }
  }

  if (cartUpdated) {
    cart.totalAmount = cart.items.reduce((s, it) => s + (it.total || (it.price * it.quantity)), 0);
    cart.updatedAt = Date.now();
    customerCarts.set(jid, cart);
  }

  return { cartUpdated, orderCreated, orderCancelled, cart, unavailable, clarifications };
}

/**
 * Items a reply names that the served shop does not stock, drawn from the catalog
 * this process knows (the shared catalogue file).
 *
 * The gate only ever sees items the model tried to ADD, so a text-only model can
 * simply SAY it has something — the reported "I have *Lifeboy soap* in stock at
 * ₹30. Would you like to add it?" — and no tag means nothing corrects it. This
 * catches that when the named item is one this process's catalog knows about: the
 * global-catalog leak that caused the report. It cannot know an invented brand it
 * has never seen, so the prompt's STORE CATALOG rules remain the first line of
 * defence, and this is the backstop.
 *
 * A name is skipped when a stocked name contains it (or it contains a stocked
 * name): those are variants of the same product, not a claim about another one.
 * That is what keeps "Maggi 2-Minute Noodles" (a longer name in the global list)
 * from flagging the shop's own "Maggi 2-Minute Noodles (70g)".
 */
export function unstockedMentions(narrative, catalog = []) {
  const text = String(narrative || '').toLowerCase();
  if (!text || !Array.isArray(catalog) || catalog.length === 0) return [];

  const stocked = catalog.map(p => String(p.name || '').toLowerCase().trim()).filter(Boolean);
  const covered = (name) => stocked.some(s => s === name || s.includes(name) || name.includes(s));

  return dukanCatalog.getAll().filter(p => {
    const name = String(p.name || '').toLowerCase().trim();
    // Too short to be a reliable claim ("Salt", "Eggs") — a bare word like that in
    // prose is far more likely to be phrasing than a named product.
    if (name.length < 6) return false;
    if (!text.includes(name)) return false;
    return !covered(name);
  });
}

/**
 * The words that mean "the shop stocks this": each item's full name and its first
 * word, so a reply saying "Tata Salt" still matches a stocked
 * "Tata Salt Vaccum Evaporated (1kg)".
 */
function stockedWords(catalog) {
  const words = new Set();
  for (const p of catalog || []) {
    const name = String(p?.name || '').toLowerCase().trim();
    if (!name) continue;
    words.add(name);
    words.add(name.split(/\s+/)[0]);
  }
  return [...words];
}

/**
 * Rebuilds the customer-facing narrative around what the gate actually did.
 *
 * The model's own words can claim it added — or simply says it has — something the
 * shop does not stock, or silently pick one of several similar products. The cart
 * footer is appended by the caller from the REAL cart state, so here we only fix
 * the prose:
 *  - an ambiguous match becomes one concrete either/or question;
 *  - a dropped or merely-mentioned unstocked item's claim is removed and the
 *    customer is told.
 *
 * `catalog` is the served shop's list; it is what tells a sentence that is merely
 * phrased like an offer of the missing item ("would you like to add it?") from one
 * that offers something the shop really has ("we have Tata Salt, want it?").
 */
export function composeGatedNarrative(narrative, { unavailable = [], clarifications = [], unstocked = [], catalog = [] } = {}) {
  if (clarifications.length > 0) {
    const options = clarifications
      .flatMap((c) => c.options)
      .slice(0, 3)
      .map((p) => `${p.name} (₹${p.price})`)
      .join('  ·  ');
    return `Which one did you mean — ${options}? Reply with the exact item and I will add it.`;
  }

  const missing = [
    ...unavailable.map((n) => String(n)),
    ...unstocked.map((p) => String((p && p.name) || p)),
  ].filter(Boolean);

  let out = String(narrative || '').trim();

  if (missing.length > 0) {
    const names = missing.map((n) => n.toLowerCase());
    // A sentence is dropped when it claims a missing item, or when it refers back
    // to such a claim ("would you like to add it?") and names nothing the shop
    // actually stocks. That second condition is what keeps a true offer like
    // "we have Tata Salt, would you like to add it?" from dying with the claim it
    // happened to follow.
    const stockWords = stockedWords(catalog);
    const namesStocked = (line) => stockWords.some((w) => line.includes(w));
    const BACK_REFERENCE = /\b(it|that|this|these|those|them)\b/i;
    const OFFER_VERB = /\b(add|order|get|pack|include|buy|want|like)\b/i;

    const kept = [];
    let droppedPrevious = false;
    for (const line of out.split(/\n|(?<=[.!?])\s+/)) {
      const lower = line.toLowerCase();
      const claimsMissing = names.some((n) => lower.includes(n));
      const danglesFromMissing =
        droppedPrevious && BACK_REFERENCE.test(lower) && OFFER_VERB.test(lower) && !namesStocked(lower);
      if (claimsMissing || danglesFromMissing) {
        droppedPrevious = true;
        continue;
      }
      droppedPrevious = false;
      kept.push(line);
    }
    out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    const list = missing.join(', ');
    const note = `Sorry, this store does not have: ${list}. Anything else?`;
    out = out ? `${out}\n\n${note}` : note;
  }

  return out;
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
    for (const product of searchInCatalog(catalogForCustomer(jid), userText)) {
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
  
  // The ONLY item source: the served shop's catalog. It used to be the global
  // catalog, which showed the model items the shop does not stock.
  const catalog = catalogForCustomer(jid);

  const systemPrompt = buildDynamicSystemPrompt(customerName, cart, catalog, userText);

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
  const unavailable = [...(modelResult.unavailable || [])];
  const clarifications = [...(modelResult.clarifications || [])];

  // The model's own words, with any cart block it wrote itself removed.
  let narrative = stripModelCartBlock(cleanUserFacingReply(rawClean));

  // Safety net: the model described a change but forgot the tag (common). Apply it.
  if (!orderCreated) {
    const reconciled = reconcileMissedActions(userText, narrative, actions, jid, customerName, customerPhone, locationData);
    if (reconciled) {
      cartUpdated = cartUpdated || reconciled.cartUpdated;
      orderCreated = reconciled.orderCreated || orderCreated;
      currentCart = reconciled.cart || currentCart;
      unavailable.push(...(reconciled.unavailable || []));
      clarifications.push(...(reconciled.clarifications || []));
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

  // The gate may have dropped items or found an ambiguous one, and the model may
  // have claimed an item in prose without emitting any tag: rebuild the prose so
  // the reply never claims something the shop does not stock.
  const unstocked = unstockedMentions(narrative, catalogForCustomer(jid));
  narrative = composeGatedNarrative(narrative, {
    unavailable,
    clarifications,
    unstocked,
    catalog: catalogForCustomer(jid),
  });

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

    // A pin on this turn is remembered for every later turn; `loc` is the
    // location to use for the rest of this message (explicit pin, else memory).
    if (locationData) rememberLocation(jid, locationData);
    const loc = locationFor(jid, locationData);

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
        const cloudReady = registryStatus() === 'configured';
        const shops = await loadShops();

        // A live registry we cannot reach must fail closed: never guess a shop.
        if (cloudReady && shops === null) {
          clearLocationHandshake(jid);
          closeConversation(jid);
          console.warn(`[Dukan Bot] ${jid} -> registry unreachable; refusing to order`);
          return { reply: SERVICE_UNAVAILABLE_REPLY, newOrder: null };
        }

        const match = matchNearestShop(locationData, shops || [], {
          // The default owner is a dev-only fallback; a live registry never uses it.
          fallbackOwner: cloudReady ? null : (process.env.DUKAN_DEFAULT_OWNER_ID || null),
        });

        if (!match.matched) {
          clearLocationHandshake(jid);
          activeShops.delete(jid);
          closeConversation(jid);
          console.log(`[Dukan Bot] ${jid} -> no shop (${match.reason})`);
          return { reply: noShopReply(match), newOrder: null };
        }

        // Load the matched shop's OWN catalog. The bot may only order from it, so
        // an empty or unreadable catalog must stop the order, not fall back to the
        // global one.
        const shop = { ...match.shop };
        let catalog;
        try {
          catalog = await loadShopCatalog(shop.userId);
        } catch (e) {
          clearLocationHandshake(jid);
          closeConversation(jid);
          console.warn(`[Dukan Bot] ${jid} -> catalog unavailable: ${e.message}`);
          return { reply: SERVICE_UNAVAILABLE_REPLY, newOrder: null };
        }
        if (!Array.isArray(catalog) || catalog.length === 0) {
          clearLocationHandshake(jid);
          closeConversation(jid);
          console.log(`[Dukan Bot] ${jid} -> shop "${shop.shopName}" has no catalog`);
          return { reply: NO_ITEMS_REPLY, newOrder: null };
        }
        shop.catalog = catalog;

        const pending = completeLocationHandshake(jid, shop);
        console.log(
          `[Dukan Bot] ${jid} -> shop "${shop.shopName}"` +
            (match.distanceKm != null ? ` (${match.distanceKm.toFixed(1)} km away)` : ' (local fallback)') +
            ` · ${shop.catalog.length} items`
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
    if (!text && loc) {
      text = `My delivery location is: ${loc.fullDescription}`;
    }

    if (!text && !loc) return null;

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
        const order = createOwnedOrder(jid, {
          customerJid: jid,
          customerPhone: phone,
          customerName: cart.customerName || pushName || 'Customer',
          deliveryAddress: cart.deliveryAddress || (loc ? loc.fullDescription : 'Address not specified'),
          location: loc || cart.location || null,
          items: cart.items,
          totalAmount: cart.totalAmount,
          notes: 'Cash on Delivery'
        });
        if (!order) {
          // No shop is connected for this customer: fail closed and keep the cart.
          return { reply: NOT_CONNECTED_REPLY, newOrder: null };
        }
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
      const aiResult = await callAiEngine(text, pushName, phone, jid, loc);
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
