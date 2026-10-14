<!-- prettier-ignore -->
<div align="center">

<img src="./public/logo.svg" alt="Dukaan.AI Logo" width="88" height="88" />

# Dukaan.AI

*Empowering Local Kirana & Grocery Stores to Win Against Quick Commerce*

[![React](https://img.shields.io/badge/React-19.1-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WhatsApp Engine](https://img.shields.io/badge/WhatsApp-Baileys%20Engine-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![AI Powered](https://img.shields.io/badge/AI-OpenRouter-7c3aed?style=flat-square)](https://openrouter.ai/)

⭐ If you like this project, star it on GitHub — it helps a lot!

[The Challenge](#the-challenge) • [Our Solution](#our-solution) • [How It Helps Kiranas](#how-it-helps-kirana-stores) • [Key Capabilities](#key-capabilities) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [Configuration](#configuration)

</div>

---

## The Challenge

Quick commerce giants (Blinkit, Zepto, Instamart) are rapidly expanding dark stores across Indian neighborhoods, threatening the livelihoods of millions of family-run Kirana and grocery stores.

Yet, local Kirana stores hold the ultimate real-world advantages:
- **Immediate Proximity**: Located inside the residential colony, minutes away from the customer's doorstep.
- **Deep Trust & Credit**: Decades of community relationships, trusted product quality, and personalized service.
- **Fresh Daily Essentials**: Sourced locally every morning without corporate warehouse delays.

However, neighborhood shopkeepers face a massive digital barrier: they cannot afford to build or maintain custom apps, and everyday customers do not want yet another app taking storage on their phones. Without digital ordering tools, local shops steadily lose regular basket sales to quick commerce monopolies.

> [!NOTE]
> WhatsApp is already installed on over 500 million Indian smartphones. Customers do not need another 100MB delivery app when they can message their local store directly.

---

## Our Solution

**Dukaan.AI** transforms any neighborhood Kirana or grocery store into an instant commerce powerhouse—leveling the playing field without costly software or complex setups.

By connecting **WhatsApp conversational ordering** with a **live, real-time shopkeeper POS dashboard**, Dukaan.AI enables local stores to receive, confirm, and dispatch orders in under 15 minutes right within their neighborhood.

- **Zero App Download for Customers**: Buyers order on WhatsApp using everyday language—texting or sending voice notes in Hindi, English, or regional languages.
- **Live Real-Time Shopkeeper POS**: Incoming orders instantly alert the merchant with an audio chime and full-screen order summary.
- **One-Touch Confirmation**: Shopkeepers accept orders with a single swipe, instantly sending an automated confirmation back to the customer on WhatsApp.
- **Hyper-Local Speed**: Neighborhood Kiranas can fulfill and deliver faster than dark stores because they are already around the corner.

---

## How It Helps Kirana Stores

| Pain Point with Quick Commerce | How Dukaan.AI Solves It |
| :--- | :--- |
| **High commissions & listing fees** | **Zero platform fee**. Direct connection between shopkeeper and neighborhood buyers. |
| **Customer app fatigue** | **Zero customer downloads**. Orders flow through WhatsApp, an app customers already use daily. |
| **Complex inventory software** | **Kirana-first POS**. Fast product lookups, one-touch stock toggles, and grocery catalog presets. |
| **Language barriers** | **Multilingual by default**. Customers can text or speak in their native tongue; orders arrive clearly structured. |
| **Lost neighborhood sales** | **Fast local dispatch**. Delivers essentials faster than centralized dark-store couriers. |

> [!TIP]
> Dukaan.AI runs with free AI inference options via OpenRouter, making it practical and accessible for independent shopkeepers with zero upfront software costs.

---

## Key Capabilities

- **Conversational WhatsApp Ordering**: Customers place orders naturally via text or voice messages. The assistant understands colloquial Indian grocery terms, clarifies quantities, and creates structured orders.
- **Instant Live POS Chime & Alert**: Web POS sounds a live audio chime whenever a new order arrives, presenting customer details, items, delivery location, and order total.
- **Swipe-to-Accept Workflow**: Shopkeepers confirm orders instantly with an intuitive gesture, automatically updating inventory and dispatching delivery updates to WhatsApp.
- **Voice Note & Location Resolution**: Built to handle real-world scenarios—voice notes for hurried buyers and pin-location sharing for precise neighborhood delivery.
- **Smart Kirana Catalog**: Pre-configured with fast-moving Indian household essentials (dairy, grains, spices, snacks, beverages), allowing shops to get started in minutes.
- **Predictive Upstocking & Procurement**: Highlights low-stock essentials before they run out and drafts ready-to-send WhatsApp reorder messages for distributors.
- **Vernacular First**: Full localized interface supporting English, Hindi, Tamil, Punjabi, Kannada, Gujarati, and Urdu.

---

## Tech Stack

### Frontend (Shopkeeper POS)
- **Framework**: React 19 + Strict TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS
- **Live Events**: Server-Sent Events (`EventSource`) for zero-latency order delivery
- **Audio Alerts**: Web Audio API (synthesized dual-tone chime, zero external sound assets)
- **Data & Storage**: React Context + HTML5 LocalStorage persistence

### Backend & Messaging (WhatsApp Engine)
- **Runtime**: Node.js (LTS >= 20) + Express 5
- **WhatsApp Bridge**: `@whiskeysockets/baileys` (multi-device web socket, persistent session)
- **Intelligence**: OpenRouter AI API (supporting fast, free-tier models)
- **Voice & Location**: Voice message transcription and reverse-geocoded map coordinates
- **Event Streaming**: SSE broadcast server pushing live order packets directly to the POS

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20 or higher)
- [Git](https://git-scm.com/)
- A mobile phone with WhatsApp installed
- *(Optional)* An [OpenRouter API key](https://openrouter.ai/keys) for AI conversational features

---

### Quick Start

#### 1. Clone the Repository

```bash
git clone https://github.com/dishudhalwal12/dukaan.ai.git
cd dukaan.ai
```

#### 2. Configure Environment

Copy the example environment files for both root and WhatsApp services:

```bash
# Frontend environment
cp .env.example .env

# WhatsApp backend environment
cd whatsapp
cp .env.example .env
cd ..
```

Add your `OPENROUTER_API_KEY` in both `.env` files if you want AI conversational ordering enabled.

#### 3. Install Dependencies & Start Services

You will run two lightweight services: the **WhatsApp Engine** (port 5001) and the **Dukaan POS** (port 3000).

```bash
# Terminal 1: Start WhatsApp Backend Engine
cd whatsapp
npm install
npm start
```

```bash
# Terminal 2: Start Dukaan POS Web Application
npm install
npm run dev
```

> [!IMPORTANT]
> Keep the WhatsApp service running on `PORT=5001`. The Vite frontend automatically proxies `/api` and `/events` from `http://localhost:3000` to `http://localhost:5001`.

#### 4. Link Your WhatsApp

1. Open your browser to **http://localhost:3000**.
2. Navigate to **Settings** > **WhatsApp Settings** (or view the terminal QR code in Terminal 1).
3. On your phone, open WhatsApp > **Linked Devices** > **Link a Device**.
4. Scan the QR code displayed on screen.
5. Your WhatsApp number is now connected. Send a test message from any other phone to start ordering!

---

## Configuration

### Environment Variables

| Variable | Location | Default | Description |
| :--- | :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | `.env`, `whatsapp/.env` | *(optional)* | API key for conversational AI assistance |
| `OPENROUTER_MODEL` | `.env`, `whatsapp/.env` | `liquid/lfm-2.5-2.6b:free` | Model identifier used for conversation |
| `PORT` | `whatsapp/.env` | `5001` | WhatsApp backend server port |
| `AUTH_DIR` | `whatsapp/.env` | `./auth_info` | Directory where WhatsApp session credentials persist |
| `N8N_WEBHOOK_URL` | `whatsapp/.env` | *(optional)* | Webhook endpoint for workflow automations |

---

## Project Structure

```
dukaan.ai/
├── public/                  # Static assets & vector logo
│   ├── logo.svg             # Project storefront brand mark
│   └── i18n/                # Regional language translation bundles
├── src/                     # Shopkeeper POS (React + TypeScript)
│   ├── App.tsx              # Main POS view & real-time SSE listener
│   ├── components/          # Order modal, product card, audio chime
│   ├── contexts/            # Product & language context providers
│   ├── data/                # Kirana grocery catalog presets
│   ├── screens/             # Catalog, Orders, Sales, Settings views
│   ├── services/            # WhatsApp & cloud sync client services
│   └── utils/               # Audio alerts, OpenRouter client, parsers
├── whatsapp/                # WhatsApp Baileys Backend Engine
│   ├── server.js            # Express server & SSE event broadcaster
│   ├── dukanBot.js          # WhatsApp conversation handler & cart parser
│   ├── dukanCatalog.js      # Store catalog synchronization
│   ├── dukanOrders.js       # Live order ledger & status management
│   ├── audioTranscriber.js  # Voice message audio transcription
│   └── locationFetcher.js   # Location pin coordinate resolver
├── index.html               # Main application entry point
├── package.json             # Root POS dependencies and scripts
└── vite.config.ts           # Vite proxy & build configuration
```
