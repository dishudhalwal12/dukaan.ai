import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dukanCatalog } from './dukanCatalog.js';
import { dukanOrders } from './dukanOrders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory conversation history per customer for OpenRouter LLM: jid -> messages[]
const conversationHistories = new Map();

// In-memory rule sessions for fallback state machine: jid -> session
const ruleSessions = new Map();

// In-memory pending order cache: jid -> { items, totalAmount, deliveryAddress, customerName, timestamp }
export const pendingOrders = new Map();

// Regex matching common affirmative replies (handles typos like "yeas", Hinglish "haan", etc.)
export const AFFIRMATIVE_REGEX = /^(yes|yeas|yep|yeah|yup|y|ok|okay|confirm|confirmed|sure|proceed|done|order|order now|haan|ha|sahi hai|bhejo|pack karo)[\s.!,]*$/i;

/**
 * Resolves real phone number from WhatsApp JID (maps privacy LIDs like 136786168832016@lid -> 917300372323)
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
 * Extracts order items, total amount, and delivery address from natural language order summary text.
 */
export function extractOrderFromSummaryText(text, defaultAddress = '') {
  if (!text) return null;

  // 1. Total Amount
  let totalAmount = 0;
  const totalMatch = text.match(/(?:Total(?:\s*Amount)?|Order\s*Total|Grand\s*Total)[:\s*]+(?:₹|Rs\.?)?\s*(\d+(?:\.\d+)?)/i);
  if (totalMatch) {
    totalAmount = parseFloat(totalMatch[1]);
  }

  // 2. Delivery Address
  let deliveryAddress = defaultAddress;
  const addrMatch = text.match(/(?:Delivery\s*Address|Address|Delivering\s*to)[:\s*]+([^\n\r*]+)/i);
  if (addrMatch && addrMatch[1].trim()) {
    deliveryAddress = addrMatch[1].trim().replace(/^[-•*]\s*/, '');
  }

  // 3. Items Extraction
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

  if (items.length === 0 && !totalAmount) {
    return null;
  }

  // Calculate missing totals
  for (const item of items) {
    if (!item.total && item.price && item.quantity) {
      item.total = item.price * item.quantity;
    }
  }

  const calculatedTotal = items.reduce((sum, it) => sum + (it.total || 0), 0);
  if (!totalAmount && calculatedTotal > 0) {
    totalAmount = calculatedTotal;
  }

  if (items.length === 1 && items[0].total === 0 && totalAmount > 0) {
    items[0].total = totalAmount;
    items[0].price = totalAmount / (items[0].quantity || 1);
  }

  return {
    items,
    totalAmount,
    deliveryAddress
  };
}

function getConversationHistory(jid) {
  if (!conversationHistories.has(jid)) {
    conversationHistories.set(jid, []);
  }
  return conversationHistories.get(jid);
}

function getRuleSession(jid, pushName = '') {
  if (!ruleSessions.has(jid)) {
    ruleSessions.set(jid, {
      jid,
      stage: 'IDLE',
      cart: [],
      customerName: pushName || '',
      deliveryAddress: '',
      pendingChoices: null,
      lastActive: Date.now()
    });
  }
  const s = ruleSessions.get(jid);
  if (pushName && !s.customerName) s.customerName = pushName;
  s.lastActive = Date.now();
  return s;
}

function formatCurrency(num) {
  return '₹' + Number(num).toFixed(0);
}

function calculateCartTotal(cart) {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/**
 * System prompt for OpenRouter AI: Pure English, short, sweet, zero AI-slop.
 */
function buildSystemPrompt(catalog, customerName, customerPhone) {
  const stockList = catalog.map(p =>
    `- ${p.name} (${p.category}, ${p.unit}): ₹${p.price} [${p.inStock ? 'In Stock' : 'Out of Stock'}]`
  ).join('\n');

  return `You are the friendly online shop assistant for "Dukan", a neighborhood grocery and convenience store.
You take orders over WhatsApp.

CUSTOMER DETAILS:
- Name: ${customerName || 'Customer'}
- Phone: ${customerPhone || 'Not specified'}

CURRENT STORE INVENTORY:
${stockList}

COMMUNICATION STYLE & TONE GUIDELINES:
1. PURE ENGLISH ONLY. Speak naturally, warmly, and politely. No slang or Hindi words.
2. SHORT AND SWEET. Real people text in 1 to 3 short sentences. Avoid robotic headers, multiple bullet emojis, divider lines (like ━━━━━), or corporate fluff.
3. MINIMAL EMOJIS. Use zero or at most one natural emoji per message (like a simple wave or checkmark). Never use AI-slop emoji spam.
4. CATALOG ONLY: Only offer in-stock items. If an item is unavailable, politely say so in one sentence and offer an in-stock alternative.
5. UPSELLING: If relevant, suggest a quick add-on naturally (e.g. cold drink with Maggi, or milk with tea).

HOW TO HANDLE ORDERS:
- Step 1: Confirm the items and quantities.
- Step 2: When the customer is done or asks to checkout:
  - Ask for their Full Name and Delivery Address (tell them they can also just share their WhatsApp location pin).
  - If they share a location pin, thank them and ask for their flat/house number if not already provided.
- Step 3: Present a clean, simple Order Summary:
  - Items, quantities, and prices
  - Total in ₹ (Cash / UPI on delivery)
  - Delivery address
  - Ask: "Reply YES to confirm your order."
- Step 4: WHEN CUSTOMER REPLIES "YES" / "CONFIRM" / "OK" / "YEAS" / "HAAN":
  - First, send confirmation text with the summary:
    "Order confirmed! 🎉
    *Order Summary*
    - Item: <Product Name>
    Quantity: <Quantity>
    Price: ₹<Price> per pack
    Total: ₹<TotalAmount>
    - Delivery Address: <Address>
    - Payment: Cash on Delivery
    Sent to the shopkeeper for confirmation."
  - Second, append this JSON block at the very end:

\`\`\`json
{
  "action": "CREATE_ORDER",
  "customerName": "<Customer Name>",
  "deliveryAddress": "<Customer Delivery Address>",
  "items": [
    { "name": "<Product Name>", "price": <PriceNumber>, "quantity": <QtyNumber>, "total": <Price * Qty> }
  ],
  "totalAmount": <TotalNumber>,
  "notes": "Cash on Delivery"
}
\`\`\`

Along with the JSON, send a short confirmation: "Order received! ⏳ Sent to the shopkeeper for confirmation. You will receive an instant notification once accepted."`;
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(userText, customerName, customerPhone, jid) {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = (process.env.OPENROUTER_MODEL || 'openrouter/free').trim();
  const catalog = dukanCatalog.getAll();
  const systemPrompt = buildSystemPrompt(catalog, customerName, customerPhone);

  const history = getConversationHistory(jid);
  history.push({ role: 'user', content: userText });

  if (history.length > 14) {
    history.splice(0, history.length - 14);
  }

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history
    ],
    temperature: 0.6,
    max_tokens: 500
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Dukan Assistant',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const assistantReply = data.choices?.[0]?.message?.content || '';

  if (assistantReply) {
    history.push({ role: 'assistant', content: assistantReply });
  }

  return assistantReply;
}

/**
 * Multi-layer OpenRouter response parser:
 * Layer 1: JSON block (fenced or unfenced)
 * Layer 2: Natural language summary extraction from AI response
 * Layer 3: Cached pending order fallback on affirmative user reply
 * Layer 4: Order summary detection to cache pending order for confirmation
 */
export function parseOpenRouterReply(replyText, jid, customerPhone, defaultName, userText = '') {
  if (!replyText) return { reply: '', newOrder: null };

  const resolvedPhone = customerPhone || resolvePhoneNumber(jid);
  let newOrder = null;
  let cleanReply = replyText;

  // Layer 1: JSON Block (fenced or unfenced)
  const jsonMatch = replyText.match(/```json\s*(\{[\s\S]*?"action"\s*:\s*"CREATE_ORDER"[\s\S]*?\})\s*```/i) ||
                    replyText.match(/(\{[\s\S]*?"action"\s*:\s*"CREATE_ORDER"[\s\S]*?\})/i);

  if (jsonMatch && jsonMatch[1]) {
    try {
      const orderData = JSON.parse(jsonMatch[1]);
      if (orderData && Array.isArray(orderData.items) && orderData.items.length > 0) {
        newOrder = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: resolvedPhone,
          customerName: orderData.customerName || defaultName || 'Customer',
          deliveryAddress: orderData.deliveryAddress || 'Address not specified',
          items: orderData.items || [],
          totalAmount: Number(orderData.totalAmount) || 0,
          notes: orderData.notes || 'Cash on Delivery'
        });

        cleanReply = replyText.replace(jsonMatch[0], '').trim();
        pendingOrders.delete(jid);
        console.log(`[Dukan AI] Order #${newOrder.id} parsed via Layer 1 JSON for ${resolvedPhone} (₹${newOrder.totalAmount})`);
      }
    } catch (e) {
      console.error('[Dukan AI] Failed to parse Layer 1 AI order JSON:', e.message);
    }
  }

  // Layer 2: Natural Language Summary Detection in AI Reply
  if (!newOrder) {
    const isOrderConfirmed = /(?:order\s*(?:confirmed|received|placed|sent|created)|sent to the shopkeeper|notified the shopkeeper)/i.test(replyText);
    const hasOrderSummary = /(?:order\s*summary|item[:\s*]|total[:\s*])/i.test(replyText);

    if (isOrderConfirmed || hasOrderSummary) {
      const cached = pendingOrders.get(jid);
      const summaryData = extractOrderFromSummaryText(replyText, cached?.deliveryAddress || '');

      if (summaryData && summaryData.items && summaryData.items.length > 0 && isOrderConfirmed) {
        newOrder = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: resolvedPhone,
          customerName: defaultName || 'Customer',
          deliveryAddress: summaryData.deliveryAddress || cached?.deliveryAddress || 'Address not specified',
          items: summaryData.items,
          totalAmount: summaryData.totalAmount,
          notes: 'Cash on Delivery'
        });

        pendingOrders.delete(jid);
        console.log(`[Dukan AI] Order #${newOrder.id} parsed via Layer 2 Natural Summary for ${resolvedPhone} (₹${newOrder.totalAmount})`);
      }
    }
  }

  // Layer 3: Cached Pending Order Fallback (when customer sends affirmative confirmation or AI confirms)
  if (!newOrder) {
    const isAffirmative = Boolean(userText && AFFIRMATIVE_REGEX.test(userText.trim()));
    const isAIConfirming = /(?:order\s*(?:confirmed|received|placed|sent)|sent to the shopkeeper)/i.test(replyText);

    if (isAffirmative || isAIConfirming) {
      const cached = pendingOrders.get(jid);
      if (cached && cached.items && cached.items.length > 0 && (Date.now() - cached.timestamp < 30 * 60 * 1000)) {
        newOrder = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: resolvedPhone,
          customerName: cached.customerName || defaultName || 'Customer',
          deliveryAddress: cached.deliveryAddress || 'Address not specified',
          items: cached.items,
          totalAmount: cached.totalAmount,
          notes: 'Cash on Delivery'
        });

        pendingOrders.delete(jid);
        console.log(`[Dukan AI] Order #${newOrder.id} finalized via Layer 3 Pending Session for ${resolvedPhone} (₹${newOrder.totalAmount})`);
      }
    }
  }

  // Layer 4: Cache Pending Order when AI outputs an Order Summary asking for confirmation
  if (!newOrder) {
    const isAskingConfirmation = /(?:reply\s*yes|confirm your order|to confirm|order summary)/i.test(replyText);
    if (isAskingConfirmation) {
      const extracted = extractOrderFromSummaryText(replyText);
      if (extracted && extracted.items && extracted.items.length > 0) {
        pendingOrders.set(jid, {
          items: extracted.items,
          totalAmount: extracted.totalAmount,
          deliveryAddress: extracted.deliveryAddress,
          customerName: defaultName,
          timestamp: Date.now()
        });
        console.log(`[Dukan AI] Cached pending order for ${jid} (${extracted.items.length} items, ₹${extracted.totalAmount})`);
      }
    }
  }

  // Sanitize reply: strip any tool call tokens or python-style function call tokens
  cleanReply = cleanReply
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
    .replace(/<\|[\s\S]*?\|>/g, '')
    .replace(/\[(?:order_order|CREATE_ORDER)[\s\S]*?\]/gi, '')
    .trim();

  // If an order was created, guarantee a clean, warm confirmation message for the customer
  if (newOrder) {
    if (!cleanReply || cleanReply.length < 5 || /tool_call|CREATE_ORDER|order_order/i.test(cleanReply)) {
      cleanReply = `Order received! ⏳ Sent to the shopkeeper for confirmation. You will receive an instant notification once accepted.`;
    }
  }

  return { reply: cleanReply, newOrder };
}

export const dukanBot = {
  /**
   * Main entry point
   * @param {Object} msg - The message record
   * @param {Object} sock - WASocket instance
   * @param {Object} locationData - Resolved location data (if shared)
   */
  async handleMessage(msg, sock, locationData = null) {
    const jid = msg.remoteJid;
    const text = (msg.text || '').trim();
    const pushName = msg.pushName || '';
    const phone = msg.from || resolvePhoneNumber(jid);

    if (!text && !locationData) return null;

    // Check OpenRouter
    const openRouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();

    if (openRouterApiKey) {
      try {
        let promptText = text;
        if (locationData) {
          promptText = `[Customer shared delivery location pin: ${locationData.fullDescription} (Google Maps: ${locationData.mapsUrl})]`;
        }

        console.log(`[Dukan AI] Processing via OpenRouter (${process.env.OPENROUTER_MODEL || 'openrouter/free'})...`);
        const aiResponse = await callOpenRouter(promptText, pushName, phone, jid);

        if (aiResponse) {
          const parsed = parseOpenRouterReply(aiResponse, jid, phone, pushName, text);
          return parsed;
        }
      } catch (err) {
        console.error('[Dukan AI] OpenRouter error, using clean fallback:', err.message);
      }
    }

    // Fallback: Clean, short, pure English state machine
    return this.handleRuleBased(msg, locationData);
  },

  /**
   * Pure English, short & sweet rule-based engine
   */
  handleRuleBased(msg, locationData = null) {
    const jid = msg.remoteJid;
    const text = (msg.text || '').trim();
    const pushName = msg.pushName || '';
    const phone = msg.from || resolvePhoneNumber(jid);

    const session = getRuleSession(jid, pushName);
    const lower = text.toLowerCase();

    // 0. Affirmative confirmation check against pending orders or active cart
    if (AFFIRMATIVE_REGEX.test(lower)) {
      if (pendingOrders.has(jid)) {
        const cached = pendingOrders.get(jid);
        pendingOrders.delete(jid);
        const order = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: phone,
          customerName: cached.customerName || pushName || 'Customer',
          deliveryAddress: cached.deliveryAddress || 'Address not specified',
          items: cached.items || [],
          totalAmount: cached.totalAmount || 0,
          notes: 'Cash on Delivery'
        });

        return {
          reply: `Order #${order.id} received! ⏳ Sent to the shopkeeper for confirmation. You will receive an instant notification once accepted.\n\nItems: ${order.items.length}\nTotal: ₹${order.totalAmount} (Cash/UPI on delivery)`,
          newOrder: order
        };
      }

      if (session.stage === 'CONFIRMING_ORDER') {
        if (session.cart.length === 0) {
          session.stage = 'IDLE';
          return { reply: `Your cart is empty. What would you like to order?` };
        }

        const totalAmount = calculateCartTotal(session.cart);
        const order = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: phone,
          customerName: session.customerName,
          deliveryAddress: session.deliveryAddress,
          items: [...session.cart],
          totalAmount,
          notes: ''
        });

        session.cart = [];
        session.stage = 'IDLE';

        return {
          reply: `Order #${order.id} received! ⏳ Sent to the shopkeeper for confirmation. You will receive an instant notification once accepted.\n\nItems: ${order.items.length}\nTotal: ${formatCurrency(totalAmount)} (Cash/UPI on delivery)`,
          newOrder: order
        };
      }

      if (session.cart.length === 0) {
        return {
          reply: `You don't have an active order right now. What would you like to order today? (e.g., "2 Maggi and 1 Parle-G")`
        };
      }
    }

    // 1. Location Pin Received
    if (locationData) {
      session.deliveryAddress = `${locationData.fullDescription} (${locationData.mapsUrl})`;

      if (session.cart.length > 0) {
        if (!session.customerName) {
          session.stage = 'ASKING_NAME';
          return {
            reply: `Got your delivery location pin! Please share your full name to proceed with the order.`
          };
        } else {
          session.stage = 'CONFIRMING_ORDER';
          return {
            reply: `Got your location! Please confirm your flat or house number:\n\n${generateConfirmationMessage(session)}`
          };
        }
      } else {
        return {
          reply: `Got your location pin! What would you like to order today? (e.g., "2 Maggi and 1 Coke")`
        };
      }
    }

    // 2. Cancel
    if (lower === 'cancel' || lower === 'reset' || lower === 'stop') {
      session.cart = [];
      session.stage = 'IDLE';
      session.pendingChoices = null;
      return {
        reply: `Your order has been cancelled. Let us know whenever you need anything!`
      };
    }

    // 3. Menu / Greeting
    if (lower === 'menu' || lower === 'items' || lower === 'catalog' || lower === 'help' || (session.stage === 'IDLE' && (lower === 'hi' || lower === 'hello' || lower === 'hey'))) {
      const inStock = dukanCatalog.getInStock();
      const itemsList = inStock.slice(0, 6).map(it => `• ${it.name} – ${formatCurrency(it.price)}`).join('\n');

      return {
        reply: `Hi! Welcome to Dukan. Here are some of our popular items:\n\n${itemsList}\n\nWhat can I get for you today?`
      };
    }

    // 4. Confirming Order stage non-affirmative
    if (session.stage === 'CONFIRMING_ORDER') {
      return {
        reply: `Please reply YES to place the order, or CANCEL to cancel.`
      };
    }

    // 5. Asking Name stage
    if (session.stage === 'ASKING_NAME') {
      const name = text.replace(/^(my name is|name:?)\s*/i, '').trim();
      if (name.length >= 2) {
        session.customerName = name;
        if (!session.deliveryAddress) {
          session.stage = 'ASKING_ADDRESS';
          return {
            reply: `Thanks, ${name}! What is your delivery address (or you can share your location pin)?`
          };
        } else {
          session.stage = 'CONFIRMING_ORDER';
          return { reply: generateConfirmationMessage(session) };
        }
      } else {
        return { reply: `Please provide your name (e.g. "Rahul Sharma").` };
      }
    }

    // 6. Asking Address stage
    if (session.stage === 'ASKING_ADDRESS') {
      const address = text.replace(/^(address:?)\s*/i, '').trim();
      if (address.length >= 5) {
        session.deliveryAddress = address;
        session.stage = 'CONFIRMING_ORDER';
        return { reply: generateConfirmationMessage(session) };
      } else {
        return { reply: `Please provide your delivery address (flat number, street, landmark) or drop a WhatsApp location pin.` };
      }
    }

    // 7. Resolving variant choice (1, 2, 3)
    if (session.pendingChoices && session.pendingChoices.length > 0) {
      const choiceIdx = parseInt(text.trim()) - 1;
      if (!isNaN(choiceIdx) && choiceIdx >= 0 && choiceIdx < session.pendingChoices.length) {
        const chosen = session.pendingChoices[choiceIdx];
        const qty = session.pendingQuantity || 1;
        session.cart.push({
          id: chosen.id,
          name: chosen.name,
          price: chosen.price,
          quantity: qty,
          total: chosen.price * qty
        });
        session.pendingChoices = null;
        session.pendingQuantity = null;

        return {
          reply: `Added ${qty}x ${chosen.name} (${formatCurrency(chosen.price * qty)}). Anything else, or ready to checkout?`
        };
      }
    }

    // 8. Checkout command
    if (lower === 'done' || lower === 'checkout' || lower === 'order' || lower === 'ready' || lower === 'thats it') {
      if (session.cart.length === 0) {
        return { reply: `Your cart is empty. What would you like to order?` };
      }
      return proceedToCheckout(session);
    }

    // 9. Catalog Product Matching
    const qty = extractQuantity(text);
    const searchResults = dukanCatalog.search(lower);

    if (searchResults.length === 1) {
      const product = searchResults[0];
      session.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        total: product.price * qty
      });
      session.stage = 'COLLECTING_ITEMS';

      return {
        reply: `Added ${qty}x ${product.name} (${formatCurrency(product.price * qty)}). Cart total: ${formatCurrency(calculateCartTotal(session.cart))}.\n\nAnything else, or reply DONE to checkout.`
      };
    } else if (searchResults.length > 1) {
      session.pendingChoices = searchResults;
      session.pendingQuantity = qty;

      let optionsText = `We have a few options available:\n`;
      searchResults.forEach((item, index) => {
        optionsText += `${index + 1}. ${item.name} – ${formatCurrency(item.price)}\n`;
      });
      optionsText += `\nReply with 1, 2, or 3 to select.`;
      return { reply: optionsText };
    }

    if (session.cart.length > 0 && (lower === 'no' || lower === 'nothing' || lower === 'nope')) {
      return proceedToCheckout(session);
    }

    // Fallback: Product not found
    return {
      reply: `Sorry, we don't have "${text}" in stock right now. We have Maggi, milk, bread, eggs, cold drinks, and chips. Reply MENU to see available items.`
    };
  }
};

function extractQuantity(text) {
  const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const digitMatch = text.match(/\b(\d+)\s*(x|packet|packets|pkt|pkts|bottle|bottles|pack|packs|piece|pieces)?\b/i);
  if (digitMatch && Number(digitMatch[1]) > 0 && Number(digitMatch[1]) < 100) {
    return Number(digitMatch[1]);
  }
  for (const [word, qty] of Object.entries(wordMap)) {
    const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
    if (wordRegex.test(text)) {
      return qty;
    }
  }
  return 1;
}

function proceedToCheckout(session) {
  if (!session.customerName) {
    session.stage = 'ASKING_NAME';
    return {
      reply: `Cart total: ${formatCurrency(calculateCartTotal(session.cart))}. Please share your full name for delivery.`
    };
  } else if (!session.deliveryAddress) {
    session.stage = 'ASKING_ADDRESS';
    return {
      reply: `Please share your delivery address (or send your location pin).`
    };
  } else {
    session.stage = 'CONFIRMING_ORDER';
    return { reply: generateConfirmationMessage(session) };
  }
}

function generateConfirmationMessage(session) {
  const total = calculateCartTotal(session.cart);
  const itemsList = session.cart.map(i => `• ${i.quantity}x ${i.name} – ${formatCurrency(i.total)}`).join('\n');

  return `Here is your order summary:\n` +
         `${itemsList}\n` +
         `Total: ${formatCurrency(total)} (Cash / UPI on delivery)\n` +
         `Name: ${session.customerName}\n` +
         `Address: ${session.deliveryAddress}\n\n` +
         `Reply YES to confirm.`;
}
