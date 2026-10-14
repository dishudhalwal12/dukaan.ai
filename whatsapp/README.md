# 🏪 Dukan — AI WhatsApp Ordering & Shopkeeper POS Platform
*(Powered by Baileys + Node.js + Optional n8n)*

**Dukan** transforms your WhatsApp number into an automated 24/7 grocery/convenience store assistant and gives shopkeepers a live, real-time Order Dashboard with instant pop-up alerts.

---

## 🌟 The Dukan Workflow

```
Customer on WhatsApp                     Dukan AI Engine                   Shopkeeper Web POS
--------------------                     ----------------                   ------------------
"I want to eat a Maggi"        --->      Searches Catalog
                               <---      "We have: 1. 2-Min (₹15), 2. Masala (₹20)..."
"2 packets of Maggi & 1 Coke"  --->      Adds to Cart (₹75)
"Done"                         --->      Collects Name & Address
"Rahul, Flat 302 Green Valley" --->      Generates Order Summary
"YES" (Confirmed)              --->      Creates Order #DKN-1001   --->    🔔 LIVE AUDIO CHIME &
                                                                           POP-UP MODAL on screen!
                                                                           [Accept] / [Reject]
                                                                                   │
"Order Accepted! Preparing..." <---      Notifies Customer         <---    Clicks ACCEPT
```

---

## 🚀 Accessing the Applications

1. **Shopkeeper Live Dashboard:**
   👉 **[http://localhost:3000/dukan](http://localhost:3000/dukan)**
   - High-visibility incoming order pop-up with sound chime.
   - One-click order acceptance (automatically notifies customer on WhatsApp).
   - Product catalog management (update prices, toggle in/out of stock, add products).
   - Test Order Simulator button.

2. **WhatsApp Web Messenger View:**
   👉 **[http://localhost:3000](http://localhost:3000)**
   - View all customer chats in real-time.
   - Configure optional n8n webhook triggers.

---

## 🚀 Quick Start

### 1. Start the Server
```bash
npm start
```
*(Or use `npm run dev` for automatic reloading on file changes).*

The server will start on **`http://localhost:3000`**.

### 2. Link Your WhatsApp
You can link your phone in two ways:

#### Option A: Scan the QR Code (Recommended)
1. Open your browser to **[http://localhost:3000](http://localhost:3000)** (or look directly at the terminal QR).
2. On your phone, open **WhatsApp**.
3. Tap **Menu (⋮ on Android)** or **Settings (⚙ on iPhone)** > **Linked Devices** > **Link a Device**.
4. Scan the QR code displayed on your screen.

#### Option B: Pair with Phone Number (8-Digit Code)
1. In the web interface at `http://localhost:3000`, click the **"Pair with Phone Number"** tab.
2. Enter your phone number with your country code (e.g. `919876543210` or `14155552671`).
3. Click **"Get Code"**.
4. Enter the 8-digit code shown on screen into the WhatsApp notification prompt on your phone.

Your session will be saved locally inside the `./auth_info` folder so you stay logged in even across restarts.

---

## ⚡ Connecting with n8n

### A. Send Messages from n8n (HTTP Request Node)

In your n8n workflow, add an **HTTP Request** node:

| Setting | Value |
| --- | --- |
| **Method** | `POST` |
| **URL** | `http://localhost:3000/api/send` |
| **Authentication** | None |
| **Send Body** | Enabled |
| **Body Content Type** | `JSON` |
| **Specify Body** | `Using JSON` |

**JSON Body Example:**
```json
{
  "to": "919876543210",
  "message": "Hello from n8n! Your automation completed successfully."
}
```

> **Tip:** You can format phone numbers with or without `+` or spaces (e.g. `"+91 98765-43210"` or `"919876543210"`). The bridge normalizes it automatically into WhatsApp's JID format (`...s.whatsapp.net`).

---

### B. Receive Messages in n8n (Webhook Node)

1. In n8n, create a new workflow and add a **Webhook** node.
2. Set **HTTP Method** to `POST`.
3. Copy the **Webhook URL** provided by n8n (e.g., `http://localhost:5678/webhook/whatsapp` or your production tunnel URL).
4. Open the web interface at `http://localhost:3000` and click the **"n8n Webhook"** button in the header (or configure it in your `.env` file as `N8N_WEBHOOK_URL`).
5. Paste your n8n webhook URL and click **"Save URL"**.
6. Click **"Test Ping"** to verify that n8n receives test events!

#### Payload sent to n8n Webhook:
Whenever someone sends you a message on WhatsApp, n8n receives this clean JSON:

```json
{
  "event": "message.received",
  "id": "3EB0489...",
  "from": "919876543210",
  "fromJid": "919876543210@s.whatsapp.net",
  "senderJid": "919876543210@s.whatsapp.net",
  "name": "Alice Smith",
  "text": "What is the status of my order #1234?",
  "timestamp": 1728840000000,
  "isGroup": false,
  "fromMe": false
}
```

---

## 📚 REST API Reference

### 1. `GET /api/status`
Checks connection status, linked phone number, and webhook URL.
```json
{
  "status": "connected",
  "user": {
    "id": "919876543210:1@s.whatsapp.net",
    "phone": "919876543210",
    "name": "My Name"
  },
  "n8nWebhookUrl": "http://localhost:5678/webhook/whatsapp",
  "port": 3000
}
```

### 2. `POST /api/send`
Send a WhatsApp text message.
```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "919876543210",
    "message": "Hello from terminal or n8n!"
  }'
```

### 3. `POST /api/pairing-code`
Request an 8-digit pairing code to link via phone number:
```bash
curl -X POST http://localhost:3000/api/pairing-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "919876543210"}'
```

### 4. `GET /api/chats`
Retrieve the list of recent conversations.

### 5. `GET /api/chats/:jid/messages`
Retrieve message history for a specific chat.

### 6. `POST /api/webhook`
Update the active n8n webhook URL:
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "http://localhost:5678/webhook/whatsapp"}'
```

### 7. `POST /api/logout`
Disconnects WhatsApp and clears credentials from `./auth_info` so a new device can be linked.

---

## 📁 Project Structure

```
.
├── Baileys/             # Cloned official Baileys repository
├── auth_info/           # Saved WhatsApp multi-file credentials
├── store/               # Saved chat & message history
├── public/              # Mini WhatsApp Web frontend
│   ├── index.html       # Web UI
│   ├── app.js           # Real-time SSE and chat handlers
│   └── style.css        # WhatsApp Dark Theme stylesheet
├── server.js            # Express server + Baileys socket engine
├── store.js             # In-memory and disk persistence
├── .env                 # Environment config (PORT, N8N_WEBHOOK_URL)
└── package.json         # Node.js dependencies & scripts
```
