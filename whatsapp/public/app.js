// State
let appState = {
  status: 'disconnected',
  user: null,
  activeChatJid: null,
  chats: [],
  messages: {},
  n8nWebhookUrl: '',
};

// DOM Elements
const authScreen = document.getElementById('authScreen');
const chatScreen = document.getElementById('chatScreen');
const connectionPill = document.getElementById('connectionPill');
const connectionText = document.getElementById('connectionText');

const qrSpinner = document.getElementById('qrSpinner');
const qrImage = document.getElementById('qrImage');
const qrExpired = document.getElementById('qrExpired');
const btnReloadQr = document.getElementById('btnReloadQr');
const btnManualRefreshQr = document.getElementById('btnManualRefreshQr');

async function refreshQrCode() {
  qrImage.classList.add('hidden');
  qrSpinner.classList.remove('hidden');
  qrExpired.classList.add('hidden');
  try {
    await fetch('/api/refresh-qr', { method: 'POST' });
  } catch (e) {
    console.error('Refresh QR failed:', e);
  }
}

if (btnManualRefreshQr) btnManualRefreshQr.addEventListener('click', refreshQrCode);
if (btnReloadQr) btnReloadQr.addEventListener('click', refreshQrCode);

const tabQr = document.getElementById('tabQr');
const tabPhone = document.getElementById('tabPhone');
const tabContentQr = document.getElementById('tabContentQr');
const tabContentPhone = document.getElementById('tabContentPhone');

const phoneNumberInput = document.getElementById('phoneNumberInput');
const btnGetPairingCode = document.getElementById('btnGetPairingCode');
const pairingCodeResult = document.getElementById('pairingCodeResult');
const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');

const myAvatar = document.getElementById('myAvatar');
const myName = document.getElementById('myName');
const myPhone = document.getElementById('myPhone');
const chatList = document.getElementById('chatList');
const chatSearch = document.getElementById('chatSearch');

const emptyChatPlaceholder = document.getElementById('emptyChatPlaceholder');
const activeChatContainer = document.getElementById('activeChatContainer');
const activeAvatar = document.getElementById('activeAvatar');
const activeContactName = document.getElementById('activeContactName');
const activeContactJid = document.getElementById('activeContactJid');
const messagesContainer = document.getElementById('messagesContainer');
const sendMessageForm = document.getElementById('sendMessageForm');
const messageInput = document.getElementById('messageInput');

// Modals
const n8nModal = document.getElementById('n8nModal');
const btnN8nModal = document.getElementById('btnN8nModal');
const btnCloseN8nModal = document.getElementById('btnCloseN8nModal');
const inputWebhookUrl = document.getElementById('inputWebhookUrl');
const btnSaveWebhook = document.getElementById('btnSaveWebhook');
const btnTestWebhook = document.getElementById('btnTestWebhook');
const webhookSaveStatus = document.getElementById('webhookSaveStatus');
const webhookLogsBody = document.getElementById('webhookLogsBody');
const btnRefreshLogs = document.getElementById('btnRefreshLogs');

const apiDocsModal = document.getElementById('apiDocsModal');
const btnApiDocsModal = document.getElementById('btnApiDocsModal');
const btnCloseApiModal = document.getElementById('btnCloseApiModal');

const newChatModal = document.getElementById('newChatModal');
const btnNewChat = document.getElementById('btnNewChat');
const btnCloseNewChatModal = document.getElementById('btnCloseNewChatModal');
const newChatForm = document.getElementById('newChatForm');
const newChatPhone = document.getElementById('newChatPhone');
const newChatMessage = document.getElementById('newChatMessage');

const btnLogout = document.getElementById('btnLogout');
const btnQuickTestN8n = document.getElementById('btnQuickTestN8n');

// Initialize
initEventSource();
fetchInitialData();

// Setup SSE listener
function initEventSource() {
  const evtSource = new EventSource('/events');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (e) {
      console.error('Error parsing SSE event:', e);
    }
  };

  evtSource.onerror = () => {
    updateStatusPill('disconnected', 'Reconnecting to bridge...');
  };
}

// Handle Server Events
function handleServerEvent(data) {
  switch (data.type) {
    case 'init':
    case 'status':
      updateConnectionState(data.status, data.user);
      if (data.qr) showQr(data.qr);
      if (data.n8nWebhookUrl) {
        appState.n8nWebhookUrl = data.n8nWebhookUrl;
        inputWebhookUrl.value = data.n8nWebhookUrl;
      }
      break;

    case 'qr':
      updateConnectionState(data.status || 'qr_ready');
      showQr(data.qr);
      break;

    case 'new_message':
      handleIncomingMessage(data.message);
      break;

    case 'webhook_log':
      prependWebhookLog(data.log);
      break;

    case 'config':
      if (data.n8nWebhookUrl !== undefined) {
        appState.n8nWebhookUrl = data.n8nWebhookUrl;
        inputWebhookUrl.value = data.n8nWebhookUrl;
      }
      break;
  }
}

// Initial Data Fetch
async function fetchInitialData() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateConnectionState(data.status, data.user);
    if (data.qr) showQr(data.qr);
    if (data.n8nWebhookUrl) {
      appState.n8nWebhookUrl = data.n8nWebhookUrl;
      inputWebhookUrl.value = data.n8nWebhookUrl;
    }
    if (data.status === 'connected') {
      loadChats();
    }
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

// Update UI Connection State
function updateConnectionState(status, user) {
  appState.status = status;
  if (user) appState.user = user;

  switch (status) {
    case 'connected':
      updateStatusPill('connected', `Connected (${appState.user?.phone || 'WhatsApp'})`);
      authScreen.classList.add('hidden');
      chatScreen.classList.remove('hidden');
      if (appState.user) {
        myName.textContent = appState.user.name || 'WhatsApp User';
        myPhone.textContent = '+' + (appState.user.phone || '');
        myAvatar.textContent = (appState.user.name || 'WA').slice(0, 2).toUpperCase();
      }
      loadChats();
      break;

    case 'qr_ready':
      updateStatusPill('qr_ready', 'Scan QR Code');
      authScreen.classList.remove('hidden');
      chatScreen.classList.add('hidden');
      break;

    case 'connecting':
      updateStatusPill('connecting', 'Connecting...');
      authScreen.classList.remove('hidden');
      chatScreen.classList.add('hidden');
      break;

    case 'disconnected':
    default:
      updateStatusPill('disconnected', 'Disconnected');
      authScreen.classList.remove('hidden');
      chatScreen.classList.add('hidden');
      break;
  }
}

function updateStatusPill(status, text) {
  connectionPill.className = `connection-pill status-${status}`;
  connectionText.textContent = text;
}

function showQr(qrDataUrl) {
  qrSpinner.classList.add('hidden');
  qrExpired.classList.add('hidden');
  qrImage.src = qrDataUrl;
  qrImage.classList.remove('hidden');
}

// Chat Management
async function loadChats() {
  try {
    const res = await fetch('/api/chats');
    const data = await res.json();
    appState.chats = data.chats || [];
    renderChatList();
  } catch (err) {
    console.error('Failed to load chats:', err);
  }
}

function renderChatList() {
  const filter = (chatSearch.value || '').toLowerCase();
  const filteredChats = appState.chats.filter(
    (c) => (c.name || '').toLowerCase().includes(filter) || (c.jid || '').includes(filter)
  );

  if (filteredChats.length === 0) {
    chatList.innerHTML = `<div class="chat-empty">No conversations found.</div>`;
    return;
  }

  chatList.innerHTML = filteredChats
    .map((chat) => {
      const isActive = chat.jid === appState.activeChatJid;
      const initials = (chat.name || chat.jid.slice(0, 2)).slice(0, 2).toUpperCase();
      const timeStr = formatTime(chat.timestamp);

      return `
      <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChat('${chat.jid}')">
        <div class="avatar">${initials}</div>
        <div class="chat-item-info">
          <div class="chat-item-header">
            <span class="chat-item-name">${escapeHtml(chat.name || chat.jid.replace(/@.*$/, ''))}</span>
            <span class="chat-item-time">${timeStr}</span>
          </div>
          <div class="chat-item-body">
            <span class="chat-item-msg">${escapeHtml(chat.lastMessage || '')}</span>
            ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

window.selectChat = async function (jid) {
  appState.activeChatJid = jid;
  const chat = appState.chats.find((c) => c.jid === jid);

  emptyChatPlaceholder.classList.add('hidden');
  activeChatContainer.classList.remove('hidden');

  const displayName = chat?.name || jid.replace(/@.*$/, '');
  activeContactName.textContent = displayName;
  activeContactJid.textContent = jid;
  activeAvatar.textContent = displayName.slice(0, 2).toUpperCase();

  renderChatList();
  await loadMessages(jid);
  messageInput.focus();
};

async function loadMessages(jid) {
  messagesContainer.innerHTML = '<div class="chat-empty">Loading messages...</div>';
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/messages`);
    const data = await res.json();
    appState.messages[jid] = data.messages || [];
    renderMessages(jid);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function renderMessages(jid) {
  const msgs = appState.messages[jid] || [];
  if (msgs.length === 0) {
    messagesContainer.innerHTML = '<div class="chat-empty">No messages yet in this conversation.</div>';
    return;
  }

  messagesContainer.innerHTML = msgs
    .map((m) => {
      const isOutgoing = m.fromMe;
      const timeStr = formatTime(m.timestamp);
      return `
      <div class="message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}">
        <div class="message-text">${escapeHtml(m.text || '')}</div>
        <div class="message-meta">
          <span>${timeStr}</span>
          ${isOutgoing ? '<span>✓✓</span>' : ''}
        </div>
      </div>
    `;
    })
    .join('');

  scrollToBottom();
}

function handleIncomingMessage(msg) {
  // Update or insert chat in chat list
  let chat = appState.chats.find((c) => c.jid === msg.remoteJid);
  if (chat) {
    chat.lastMessage = msg.text;
    chat.timestamp = msg.timestamp;
    if (!msg.fromMe && msg.remoteJid !== appState.activeChatJid) {
      chat.unread = (chat.unread || 0) + 1;
    }
  } else {
    chat = {
      jid: msg.remoteJid,
      name: msg.pushName || msg.remoteJid.replace(/@.*$/, ''),
      lastMessage: msg.text,
      timestamp: msg.timestamp,
      unread: msg.fromMe ? 0 : 1,
    };
    appState.chats.unshift(chat);
  }

  // Sort chats
  appState.chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  renderChatList();

  // If this message belongs to active chat, append to messages
  if (msg.remoteJid === appState.activeChatJid) {
    if (!appState.messages[msg.remoteJid]) appState.messages[msg.remoteJid] = [];
    appState.messages[msg.remoteJid].push(msg);
    renderMessages(msg.remoteJid);
  }
}

// Send Message
sendMessageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !appState.activeChatJid) return;

  const targetJid = appState.activeChatJid;
  messageInput.value = '';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: targetJid,
        message: text,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      alert('Error sending message: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to send message:', err);
    alert('Failed to send message: ' + err.message);
  }
});

// Phone Pairing Code Request
btnGetPairingCode.addEventListener('click', async () => {
  const phone = phoneNumberInput.value.trim();
  if (!phone) {
    alert('Please enter a phone number with country code (e.g. 919876543210)');
    return;
  }

  btnGetPairingCode.disabled = true;
  btnGetPairingCode.textContent = 'Requesting...';

  try {
    const res = await fetch('/api/pairing-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    });

    const data = await res.json();
    if (data.code) {
      pairingCodeResult.classList.remove('hidden');
      pairingCodeDisplay.textContent = data.code;
    } else {
      alert('Error: ' + (data.error || 'Failed to generate code'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btnGetPairingCode.disabled = false;
    btnGetPairingCode.textContent = 'Get Code';
  }
});

// Tab switching
tabQr.addEventListener('click', () => {
  tabQr.classList.add('active');
  tabPhone.classList.remove('active');
  tabContentQr.classList.add('active');
  tabContentPhone.classList.remove('active');
});

tabPhone.addEventListener('click', () => {
  tabPhone.classList.add('active');
  tabQr.classList.remove('active');
  tabContentPhone.classList.add('active');
  tabContentQr.classList.remove('active');
});

// n8n Modal Handlers
btnN8nModal.addEventListener('click', () => {
  n8nModal.classList.remove('hidden');
  loadWebhookLogs();
});

btnCloseN8nModal.addEventListener('click', () => {
  n8nModal.classList.add('hidden');
});

btnSaveWebhook.addEventListener('click', async () => {
  const url = inputWebhookUrl.value.trim();
  webhookSaveStatus.textContent = 'Saving...';
  webhookSaveStatus.className = 'status-msg';

  try {
    const res = await fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url }),
    });
    const data = await res.json();
    if (data.success) {
      webhookSaveStatus.textContent = 'Webhook URL saved successfully!';
      webhookSaveStatus.className = 'status-msg success';
      setTimeout(() => (webhookSaveStatus.textContent = ''), 3000);
    }
  } catch (err) {
    webhookSaveStatus.textContent = 'Error saving webhook: ' + err.message;
    webhookSaveStatus.className = 'status-msg error';
  }
});

btnTestWebhook.addEventListener('click', async () => {
  webhookSaveStatus.textContent = 'Dispatching test ping to n8n...';
  webhookSaveStatus.className = 'status-msg';

  try {
    const res = await fetch('/api/webhook/test', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      webhookSaveStatus.textContent = `Test ping delivered! HTTP ${data.status} (${data.durationMs}ms)`;
      webhookSaveStatus.className = 'status-msg success';
      loadWebhookLogs();
    } else {
      webhookSaveStatus.textContent = `Test ping failed: ${data.error || 'HTTP ' + data.status}`;
      webhookSaveStatus.className = 'status-msg error';
    }
  } catch (err) {
    webhookSaveStatus.textContent = 'Network error: ' + err.message;
    webhookSaveStatus.className = 'status-msg error';
  }
});

btnRefreshLogs.addEventListener('click', loadWebhookLogs);

async function loadWebhookLogs() {
  try {
    const res = await fetch('/api/webhook/logs');
    const data = await res.json();
    renderWebhookLogs(data.logs || []);
  } catch (err) {}
}

function renderWebhookLogs(logs) {
  if (logs.length === 0) {
    webhookLogsBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No webhook logs yet.</td></tr>';
    return;
  }

  webhookLogsBody.innerHTML = logs
    .map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const badgeClass = log.status === 'success' ? 'success' : 'error';
      return `
      <tr>
        <td>${time}</td>
        <td>${escapeHtml(log.from || '')}</td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(log.text || '')}</td>
        <td><span class="log-badge ${badgeClass}">${log.responseCode || log.status}</span></td>
      </tr>
    `;
    })
    .join('');
}

function prependWebhookLog(log) {
  loadWebhookLogs();
}

// Quick trigger n8n from active chat
btnQuickTestN8n.addEventListener('click', async () => {
  if (!appState.activeChatJid) return;
  const chat = appState.chats.find((c) => c.jid === appState.activeChatJid);
  const from = appState.activeChatJid.replace(/@.*$/, '');

  try {
    const res = await fetch('/api/webhook/test', { method: 'POST' });
    const data = await res.json();
    alert(data.success ? 'n8n Webhook received test event successfully!' : 'Webhook failed: ' + data.error);
  } catch (e) {
    alert('Error testing webhook: ' + e.message);
  }
});

// API Docs Modal
btnApiDocsModal.addEventListener('click', () => apiDocsModal.classList.remove('hidden'));
btnCloseApiModal.addEventListener('click', () => apiDocsModal.classList.add('hidden'));

// New Chat Modal
btnNewChat.addEventListener('click', () => {
  newChatPhone.value = '';
  newChatMessage.value = '';
  newChatModal.classList.remove('hidden');
  newChatPhone.focus();
});
btnCloseNewChatModal.addEventListener('click', () => newChatModal.classList.add('hidden'));

newChatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = newChatPhone.value.trim();
  const initialMsg = newChatMessage.value.trim();
  if (!phone) return;

  const jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
  newChatModal.classList.add('hidden');

  window.selectChat(jid);

  if (initialMsg) {
    await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: jid, message: initialMsg }),
    });
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to disconnect WhatsApp and clear the session?')) return;
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (e) {
    alert('Logout error: ' + e.message);
  }
});

// Filter chats search
chatSearch.addEventListener('input', renderChatList);

// Utilities
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
