#!/usr/bin/env python3
"""
scripts/local-ai/chat_dukaan.py
Interactive Terminal Chat to test the fine-tuned Dukaan.ai model.
Run: python3 scripts/local-ai/chat_dukaan.py
Commands inside chat:
  /reset  - Start a fresh WhatsApp customer conversation
  /stock  - Show the live Kirana inventory
  /quit   - Exit chat
"""

import json
import re
import sys
import urllib.request

API_URL = "http://127.0.0.1:8080/v1/chat/completions"

LIVE_INVENTORY = """- Aashirvaad Shudh Chakki Atta (5kg pack) | Category: Staples | Price: Rs.245 | Status: IN_STOCK
- India Gate Basmati Rice Classic (5kg pack) | Category: Staples | Price: Rs.560 | Status: IN_STOCK
- Tata Sampann Unpolished Toor Dal (1kg pack) | Category: Staples | Price: Rs.165 | Status: IN_STOCK
- Fortune Sunlite Refined Sunflower Oil (1L pouch) | Category: Cooking Oil | Price: Rs.145 | Status: IN_STOCK
- Tata Salt Vacuum Evaporated (1kg pack) | Category: Staples | Price: Rs.28 | Status: IN_STOCK
- Amul Taaza Homogenised Toned Milk (500ml pouch) | Category: Dairy | Price: Rs.27 | Status: IN_STOCK
- Amul Gold Full Cream Milk (1L pack) | Category: Dairy | Price: Rs.66 | Status: IN_STOCK
- Amul Masti Dahi (400g cup) | Category: Dairy | Price: Rs.35 | Status: IN_STOCK
- Amul Pasteurised Butter (100g pack) | Category: Dairy | Price: Rs.58 | Status: IN_STOCK
- Mother Dairy Fresh Paneer (200g pack) | Category: Dairy | Price: Rs.90 | Status: IN_STOCK
- Britannia 100% Whole Wheat Bread (400g loaf) | Category: Bakery | Price: Rs.50 | Status: IN_STOCK
- Farm Fresh White Eggs (6 pcs pack) | Category: Dairy | Price: Rs.48 | Status: IN_STOCK
- Maggi 2-Minute Masala Noodles (70g pack) | Category: Instant Food | Price: Rs.14 | Status: IN_STOCK
- Maggi 2-Minute Masala Noodles (4-Pack) (280g pack) | Category: Instant Food | Price: Rs.55 | Status: IN_STOCK
- Tata Tea Gold (250g pack) | Category: Beverages | Price: Rs.150 | Status: IN_STOCK
- Parle-G Original Gluco Biscuits (250g pack) | Category: Biscuits | Price: Rs.25 | Status: IN_STOCK
- Haldiram's Aloo Bhujia (200g pack) | Category: Snacks | Price: Rs.55 | Status: IN_STOCK
- Lay's India's Magic Masala Chips (50g pack) | Category: Snacks | Price: Rs.20 | Status: IN_STOCK
- Surf Excel Easy Wash Detergent Powder (1kg pack) | Category: Household | Price: Rs.135 | Status: IN_STOCK
- Thums Up Soft Drink (750ml bottle) | Category: Beverages | Price: Rs.45 | Status: IN_STOCK"""

SYSTEM_PROMPT = (
    "You are Dukaan.ai, a polite, helpful WhatsApp sales assistant for an Indian neighborhood Kirana store.\n"
    "STRICT RULES:\n"
    "1. GREETING: If the customer says 'hi', 'hello', 'hey', 'namaste', or sends a casual greeting, greet them warmly and ask how you can help or what groceries they would like to order today. DO NOT ask for their name or address yet!\n"
    "2. REFUSALS & CHIT-CHAT: If the customer says 'no', 'cancel', 'nothing', or 'not now', reply politely: 'No problem! Let me know whenever you need any groceries. Have a great day!'\n"
    "3. INVENTORY: Only offer IN_STOCK items from the LIVE INVENTORY below and quote exact catalog prices. Never offer OUT_OF_STOCK items.\n"
    "4. ORDER FLOW:\n"
    "   - Step 1: When the customer asks for items, confirm the items and unit prices.\n"
    "   - Step 2: ONLY after items are selected, ask for their Full Name and Delivery Address.\n"
    "   - Step 3: Once items, Name, and Address are known, show an Order Summary with totals and ask: \"Reply YES to confirm your order.\"\n"
    "   - Step 4: ONLY when the customer explicitly confirms (e.g., YES, CONFIRM, OK, HAAN), output a short English confirmation message followed by the strict CREATE_ORDER JSON block.\n"
    "5. LANGUAGE & TONE: 100% courteous English. 1-2 sentences. Maximum 1 emoji. Zero robotic filler.\n\n"
    f"LIVE INVENTORY:\n{LIVE_INVENTORY}"
)

def call_local_model(messages):
    payload = {
        "model": "models/dukaan-qwen-1.5b-fused-4bit",
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 350,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()

def main():
    import os
    print("=" * 72)
    print("🛒 DUKAAN.AI LIVE WHATSAPP BOT SIMULATOR (100% OFFLINE LOCAL SLM)")
    print("Type in English, Hinglish, or shorthand (e.g., 'bhai 2 maggi aur 1 bread bhejna')")
    print("Commands: /reset or /clear (new chat) | /stock (view inventory) | /quit (exit)")
    print("=" * 72)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    while True:
        try:
            user_input = input("\n👤 Customer (You): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting chat.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("/quit", "exit", "quit"):
            break
        if user_input.lower() in ("/reset", "/clear", "clear", "reset"):
            os.system('clear' if os.name == 'posix' else 'cls')
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            print("=" * 72)
            print("🛒 DUKAAN.AI LIVE WHATSAPP BOT SIMULATOR (100% OFFLINE LOCAL SLM)")
            print("🔄 Conversation history cleared! Ready for new customer.")
            print("=" * 72)
            continue
        if user_input.lower() in ("/stock", "stock"):
            print("\n📦 CURRENT KIRANA INVENTORY:\n" + LIVE_INVENTORY)
            continue

        # Fast intent handling for conversational greetings & refusals
        lower_input = user_input.lower().strip()
        if re.match(r"^(hi+|hello+|hey+|namaste|kya haal|good morning|yo)\b", lower_input):
            greeting_reply = "Hello! Welcome to Apna Kirana store. 🛒 What groceries would you like to order today? (e.g. '2 Maggi aur 1 milk')"
            messages.append({"role": "user", "content": user_input})
            messages.append({"role": "assistant", "content": greeting_reply})
            print(f"\n🤖 Dukaan.ai Bot:\n{greeting_reply}")
            continue

        if re.match(r"^(no+|nope|nah|nahi|cancel|stop|nothing|not now|baad me)\b", lower_input) and len(lower_input.split()) <= 3:
            rejection_reply = "No problem! Let me know whenever you need any groceries. Have a great day! 😊"
            messages.append({"role": "user", "content": user_input})
            messages.append({"role": "assistant", "content": rejection_reply})
            print(f"\n🤖 Dukaan.ai Bot:\n{rejection_reply}")
            continue

        messages.append({"role": "user", "content": user_input})

        try:
            reply = call_local_model(messages)
        except Exception as e:
            print(f"❌ Could not reach local model server at {API_URL}: {e}")
            print("Run `./scripts/local-ai/start_local_server.sh` first.")
            messages.pop()
            continue

        messages.append({"role": "assistant", "content": reply})
        print(f"\n🤖 Dukaan.ai Bot:\n{reply}")

        # Highlight if CREATE_ORDER JSON was emitted
        json_match = re.search(r"\{\s*\"action\"\s*:\s*\"CREATE_ORDER\"[\s\S]*\}", reply)
        if json_match:
            print("\n" + "🎉" * 20)
            print("✅ [BACKEND TRIGGERED] Valid CREATE_ORDER JSON Payload Detected!")
            print("🎉" * 20)

if __name__ == "__main__":
    main()
