#!/usr/bin/env node
import readline from 'readline';
import { dukanBot } from '../whatsapp/dukanBot.js';
import { store } from '../whatsapp/store.js';

// Pre-configured profiles for quick switching
const PROFILES = [
  { id: '1', name: 'Pulkit Khowal (Vishi Mama)', phone: '919876543210', jid: '919876543210@s.whatsapp.net' },
  { id: '2', name: 'Manas Agarwal', phone: '919123456789', jid: '919123456789@s.whatsapp.net' },
  { id: '3', name: 'Dishu Tester', phone: '919256487182', jid: '919256487182@s.whatsapp.net' },
];

let currentProfile = { ...PROFILES[0] };

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `\x1b[36m[${currentProfile.name}]\x1b[0m > `,
});

console.clear();
console.log(`
========================================================================
🛒 \x1b[1m\x1b[32mDUKAAN AI — TERMINAL INTERACTIVE CHAT\x1b[0m
========================================================================
Test the WhatsApp ordering AI directly in your terminal.
All messages (your inputs and AI replies) are \x1b[33mautomatically saved\x1b[0m
to \x1b[34mwhatsapp/store/messages.json\x1b[0m in real-time!

\x1b[1mCommands:\x1b[0m
  \x1b[33m/switch [1|2|3|<phone>]\x1b[0m  Switch active customer (simulates 2+ users)
  \x1b[33m/cart\x1b[0m                  View active cart for current user
  \x1b[33m/clear\x1b[0m                 Reset cart for current user
  \x1b[33m/history\x1b[0m               View last 10 messages from messages.json
  \x1b[33m/help\x1b[0m                  Show this help menu
  \x1b[33m/exit\x1b[0m                  Exit chat session

\x1b[32mActive User:\x1b[0m ${currentProfile.name} (${currentProfile.phone})
------------------------------------------------------------------------
`);

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  // Command: /exit
  if (input === '/exit' || input === 'exit' || input === 'quit') {
    console.log('\n👋 Exiting Nukkad Terminal Chat. Goodbye!\n');
    process.exit(0);
  }

  // Command: /help
  if (input === '/help') {
    console.log(`
Commands:
  /switch 1|2|3|<phone> [Name]  Switch customer profile
  /cart                         Inspect current user's active cart
  /clear                        Reset active cart
  /history                      Show last 10 stored messages
  /exit                         Exit
`);
    rl.prompt();
    return;
  }

  // Command: /switch
  if (input.startsWith('/switch') || input.startsWith('/user')) {
    const parts = input.split(/\s+/).slice(1);
    const target = parts[0];
    const customName = parts.slice(1).join(' ');

    if (!target) {
      console.log(`Available default profiles:`);
      PROFILES.forEach(p => console.log(`  [${p.id}] ${p.name} (${p.phone})`));
      console.log(`Or type: /switch 919999999999 Custom Name`);
    } else {
      const match = PROFILES.find(p => p.id === target || p.phone === target);
      if (match) {
        currentProfile = { ...match };
      } else {
        const cleanPhone = target.replace(/\D/g, '');
        currentProfile = {
          id: 'custom',
          name: customName || `Customer ${cleanPhone}`,
          phone: cleanPhone,
          jid: `${cleanPhone}@s.whatsapp.net`,
        };
      }
      console.log(`\n🔄 \x1b[32mSwitched active customer to:\x1b[0m ${currentProfile.name} (${currentProfile.phone})\n`);
      rl.setPrompt(`\x1b[36m[${currentProfile.name}]\x1b[0m > `);
    }
    rl.prompt();
    return;
  }

  // Command: /cart
  if (input === '/cart') {
    const { customerCarts } = await import('../whatsapp/dukanBot.js');
    const cart = customerCarts.get(currentProfile.jid);
    if (!cart || !cart.items || cart.items.length === 0) {
      console.log(`\n🛒 Cart for ${currentProfile.name} is currently empty.\n`);
    } else {
      console.log(`\n🛒 \x1b[1mActive Cart for ${currentProfile.name}:\x1b[0m`);
      cart.items.forEach(it => {
        console.log(`   • ${it.quantity}x ${it.name} @ ₹${it.price} = ₹${it.total}`);
      });
      console.log(`   ------------------------------------`);
      console.log(`   \x1b[32mTotal:\x1b[0m ₹${cart.totalAmount}`);
      console.log(`   \x1b[33mAddress:\x1b[0m ${cart.deliveryAddress || '(not provided yet)'}\n`);
    }
    rl.prompt();
    return;
  }

  // Command: /clear
  if (input === '/clear') {
    const { customerCarts } = await import('../whatsapp/dukanBot.js');
    customerCarts.delete(currentProfile.jid);
    console.log(`\n🧹 Cart cleared for ${currentProfile.name}.\n`);
    rl.prompt();
    return;
  }

  // Command: /history
  if (input === '/history') {
    const msgs = store.getMessages(currentProfile.jid);
    console.log(`\n📜 \x1b[1mLast ${Math.min(msgs.length, 10)} messages for ${currentProfile.name}:\x1b[0m`);
    if (msgs.length === 0) {
      console.log('   (No messages stored yet)');
    } else {
      msgs.slice(-10).forEach(m => {
        const time = new Date(m.timestamp).toLocaleTimeString();
        const prefix = m.fromMe ? '\x1b[35m[Nukkad]\x1b[0m' : `\x1b[36m[${m.pushName || 'User'}]\x1b[0m`;
        console.log(`   ${time} ${prefix}: ${m.text}`);
      });
    }
    console.log('');
    rl.prompt();
    return;
  }

  // Normal Chat Message Processing:
  rl.pause();
  const messageRecord = {
    id: 'cli-user-' + Date.now(),
    remoteJid: currentProfile.jid,
    from: currentProfile.phone,
    fromMe: false,
    senderJid: currentProfile.jid,
    pushName: currentProfile.name,
    text: input,
    timestamp: Date.now(),
    isGroup: false,
    status: 'RECEIVED',
  };

  // 1. Immediately store user message in whatsapp/store/messages.json
  store.addMessage(messageRecord);

  // 2. Mock sock for bot
  const mockSock = {
    async sendMessage(jid, content) {
      return { key: { id: 'cli-bot-' + Date.now() } };
    }
  };

  try {
    // 3. Process via Nukkad Bot
    const botResult = await dukanBot.handleMessage(messageRecord, mockSock, null);

    if (botResult && botResult.reply) {
      const replyRecord = {
        id: 'cli-bot-' + Date.now(),
        remoteJid: currentProfile.jid,
        from: currentProfile.phone,
        fromMe: true,
        pushName: 'Nukkad Assistant',
        text: botResult.reply,
        timestamp: Date.now(),
        isGroup: false,
        status: 'SENT',
      };

      // 4. Immediately store bot reply in whatsapp/store/messages.json
      store.addMessage(replyRecord);

      // Print bot response
      console.log(`\n\x1b[35m[Nukkad]\x1b[0m:\n${botResult.reply}\n`);

      if (botResult.newOrder) {
        console.log(`\x1b[32m🛎️ ORDER CONFIRMED & RECORDED!\x1b[0m`);
        console.log(`   Order ID: #${botResult.newOrder.id}`);
        console.log(`   Customer: ${botResult.newOrder.customerName} (${botResult.newOrder.customerPhone})`);
        console.log(`   Address:  ${botResult.newOrder.deliveryAddress}`);
        console.log(`   Total:    ₹${botResult.newOrder.totalAmount}\n`);
      }
    } else {
      console.log(`\n\x1b[33m[Nukkad]\x1b[0m: (No reply generated)\n`);
    }
  } catch (err) {
    console.error(`\x1b[31m[Error]:\x1b[0m`, err);
  } finally {
    rl.resume();
    rl.prompt();
  }
});

rl.on('close', () => {
  console.log('\n👋 Exiting Nukkad Terminal Chat. Goodbye!\n');
  process.exit(0);
});
