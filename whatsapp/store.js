import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'store');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure store directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory caches
let chats = [];
let messages = {}; // jid -> array of message objects

// Load from disk if exists
try {
  if (fs.existsSync(CHATS_FILE)) {
    chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
  }
} catch (e) {
  chats = [];
}

try {
  if (fs.existsSync(MESSAGES_FILE)) {
    messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  }
} catch (e) {
  messages = {};
}

function saveChats() {
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
  } catch (err) {
    console.error('Failed to save chats to disk:', err.message);
  }
}

function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('Failed to save messages to disk:', err.message);
  }
}

export const store = {
  getChats() {
    return [...chats].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  },

  getMessages(jid) {
    return messages[jid] || [];
  },

  addMessage(msg) {
    const jid = msg.remoteJid;
    if (!jid) return;

    if (!messages[jid]) {
      messages[jid] = [];
    }

    // Check if message already exists by id
    const existingIndex = messages[jid].findIndex((m) => m.id === msg.id);
    if (existingIndex >= 0) {
      messages[jid][existingIndex] = { ...messages[jid][existingIndex], ...msg };
    } else {
      messages[jid].push(msg);
      // Preserve all precious customer message history (no truncation)
    }

    // Update or insert chat entry
    let chat = chats.find((c) => c.jid === jid);
    const lastText = msg.text || (msg.mediaType ? `[${msg.mediaType}]` : '');
    const displayName = msg.pushName || chat?.name || jid.replace(/@.*$/, '');

    if (chat) {
      chat.lastMessage = lastText;
      chat.timestamp = msg.timestamp || Date.now();
      if (msg.pushName && (!chat.name || chat.name === jid.replace(/@.*$/, ''))) {
        chat.name = msg.pushName;
      }
      if (!msg.fromMe) {
        chat.unread = (chat.unread || 0) + 1;
      }
    } else {
      chat = {
        jid,
        name: displayName,
        lastMessage: lastText,
        timestamp: msg.timestamp || Date.now(),
        unread: msg.fromMe ? 0 : 1,
      };
      chats.push(chat);
    }

    saveChats();
    saveMessages();
    return chat;
  },

  markChatRead(jid) {
    const chat = chats.find((c) => c.jid === jid);
    if (chat) {
      chat.unread = 0;
      saveChats();
    }
  },

  clear() {
    chats = [];
    messages = {};
    saveChats();
    saveMessages();
  }
};
