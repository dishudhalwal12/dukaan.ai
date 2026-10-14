import { dukanCatalog } from './dukanCatalog.js';
import { dukanOrders } from './dukanOrders.js';

// In-memory conversation history per customer for OpenRouter LLM: jid -> messages[]
const conversationHistories = new Map();

// In-memory rule sessions for fallback state machine: jid -> session
const ruleSessions = new Map();

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
- Step 4: WHEN CUSTOMER REPLIES "YES" / "CONFIRM" / "OK":
  - Output this exact JSON block at the very end of your response to notify the shopkeeper:

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

Along with the JSON, send a short confirmation: "Order placed! The shopkeeper is packing it now and it will be delivered in 15-20 mins."`;
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
 * Parse OpenRouter response for order creation JSON
 */
function parseOpenRouterReply(replyText, jid, customerPhone, defaultName) {
  if (!replyText) return { reply: '', newOrder: null };

  const jsonRegex = /```json\s*(\{[\s\S]*?"action"\s*:\s*"CREATE_ORDER"[\s\S]*?\})\s*```/i;
  const match = replyText.match(jsonRegex);

  let newOrder = null;
  let cleanReply = replyText;

  if (match && match[1]) {
    try {
      const orderData = JSON.parse(match[1]);
      newOrder = dukanOrders.createOrder({
        customerJid: jid,
        customerPhone: customerPhone || jid.replace(/@.*$/, ''),
        customerName: orderData.customerName || defaultName || 'Customer',
        deliveryAddress: orderData.deliveryAddress || 'Address not specified',
        items: orderData.items || [],
        totalAmount: Number(orderData.totalAmount) || 0,
        notes: orderData.notes || ''
      });

      cleanReply = replyText.replace(match[0], '').trim();
    } catch (e) {
      console.error('[Dukan] Failed to parse AI order JSON:', e.message);
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
    const phone = jid.replace(/@.*$/, '');

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
          const parsed = parseOpenRouterReply(aiResponse, jid, phone, pushName);
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

    const session = getRuleSession(jid, pushName);
    const lower = text.toLowerCase();

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

    // 4. Confirming Order stage
    if (session.stage === 'CONFIRMING_ORDER') {
      if (lower === 'yes' || lower === 'confirm' || lower === 'y' || lower === 'ok' || lower === 'order') {
        if (session.cart.length === 0) {
          session.stage = 'IDLE';
          return { reply: `Your cart is empty. What would you like to order?` };
        }

        const totalAmount = calculateCartTotal(session.cart);
        const order = dukanOrders.createOrder({
          customerJid: jid,
          customerPhone: jid.replace(/@.*$/, ''),
          customerName: session.customerName,
          deliveryAddress: session.deliveryAddress,
          items: [...session.cart],
          totalAmount,
          notes: ''
        });

        session.cart = [];
        session.stage = 'IDLE';

        return {
          reply: `Order #${order.id} placed! The shopkeeper is packing your items now and they will be delivered in 15-20 minutes. Total: ${formatCurrency(totalAmount)} (Cash/UPI on delivery).`,
          newOrder: order
        };
      } else {
        return {
          reply: `Please reply YES to place the order, or CANCEL to cancel.`
        };
      }
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
