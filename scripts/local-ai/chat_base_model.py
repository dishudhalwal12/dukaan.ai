#!/usr/bin/env python3
"""
scripts/local-ai/chat_base_model.py
Interactive Terminal Chat with the Raw Non-Fine-Tuned Base Model (qwen2.5:7b-instruct).
Connected via Cloudflare Tunnel to remote GPU endpoint.
Uses the exact system prompt, guidelines, and catalog from whatsapp/dukanBot.js.

Run:
  python3 scripts/local-ai/chat_base_model.py
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error

ENDPOINT_URL = os.getenv(
    "LLM_BASE_URL",
    "https://acrobat-shorter-breaking-cluster.trycloudflare.com/v1/chat/completions"
)
MODEL_NAME = os.getenv("LLM_MODEL_NAME", "hf.co/samunder12/Llama-3.2-3B-small_Shiro_roleplay-gguf")

# Exact catalog from whatsapp/dukanCatalog.js
DEFAULT_CATALOG = [
    {"name": "Maggi 2-Minute Noodles", "category": "Snacks", "unit": "packet (70g)", "price": 15, "inStock": True},
    {"name": "Maggi Special Masala Noodles", "category": "Snacks", "unit": "packet (70g)", "price": 20, "inStock": True},
    {"name": "Maggi Atta Noodles", "category": "Snacks", "unit": "packet (72.5g)", "price": 25, "inStock": True},
    {"name": "Amul Taaza Milk", "category": "Dairy", "unit": "500ml pouch", "price": 27, "inStock": True},
    {"name": "Amul Butter", "category": "Dairy", "unit": "100g pack", "price": 58, "inStock": True},
    {"name": "Britannia White Bread", "category": "Bakery", "unit": "400g loaf", "price": 35, "inStock": True},
    {"name": "Coca-Cola", "category": "Beverages", "unit": "750ml bottle", "price": 45, "inStock": True},
    {"name": "Thums Up", "category": "Beverages", "unit": "750ml bottle", "price": 45, "inStock": True},
    {"name": "Kurkure Masala Munch", "category": "Snacks", "unit": "packet (85g)", "price": 20, "inStock": True},
    {"name": "Lay's Classic Salted", "category": "Snacks", "unit": "packet (50g)", "price": 20, "inStock": True},
    {"name": "Parle-G Biscuits", "category": "Biscuits", "unit": "pack (130g)", "price": 10, "inStock": True},
    {"name": "Good Day Butter Cookies", "category": "Biscuits", "unit": "pack (100g)", "price": 20, "inStock": True},
    {"name": "Red Label Tea (Chai Patti)", "category": "Groceries", "unit": "250g pack", "price": 110, "inStock": True},
    {"name": "Tata Salt", "category": "Groceries", "unit": "1kg pack", "price": 28, "inStock": True},
    {"name": "Aashirvaad Shudh Chakki Atta", "category": "Groceries", "unit": "5kg bag", "price": 245, "inStock": True},
    {"name": "Farm Fresh Eggs", "category": "Dairy", "unit": "pack of 6", "price": 42, "inStock": True},
]

def build_inventory_text(catalog):
    return "\n".join(
        f"- {p['name']} ({p['category']}, {p['unit']}): ₹{p['price']} [{'In Stock' if p['inStock'] else 'Out of Stock'}]"
        for p in catalog
    )

def build_system_prompt(catalog, customer_name="Customer", customer_phone="Not specified"):
    stock_list = build_inventory_text(catalog)
    return f"""You are the friendly online shop assistant for "Dukan", a neighborhood grocery and convenience store.
You take orders over WhatsApp.

CUSTOMER DETAILS:
- Name: {customer_name}
- Phone: {customer_phone}

CURRENT STORE INVENTORY:
{stock_list}

COMMUNICATION STYLE & TONE GUIDELINES:
1. PURE ENGLISH ONLY. Speak naturally, warmly, and politely. No slang or Hindi words.
2. SHORT AND SWEET. Real people text in 1 to 3 short sentences. Avoid robotic headers, multiple bullet emojis, divider lines (like ━━━━━), or corporate fluff.
3. MINIMAL EMOJIS. Use zero or at most one natural emoji per message. Never use AI-slop emoji spam.
4. CATALOG ONLY: Only offer in-stock items. Use the EXACT prices listed above in CURRENT STORE INVENTORY. Do not hallucinate prices or multiply them incorrectly.
5. UPSELLING: If relevant, suggest a quick add-on naturally (e.g. cold drink with Maggi, or milk with tea).

HOW TO HANDLE CONVERSATIONS & ORDERS:
- Step 0 (Greetings): If the customer just greets (e.g. "hi", "hello", "namaste"), greet them warmly and ask what groceries they want today. NEVER ask for Name or Address until items are ordered!
- Step 0B (Refusals): If the customer says "no", "cancel", or "nothing", politely acknowledge without demanding an address.
- Step 1: Confirm the requested items and quantities.
- Step 2: When the customer is done or asks to checkout:
  - Ask for their Full Name and Delivery Address (tell them they can also just share their WhatsApp location pin).
  - If they share a location pin, thank them and ask for their flat/house number if not already provided.
- Step 3: Present a clean, simple Order Summary with the item names, quantities, unit prices from inventory, and delivery address.
  - Ask: "Reply YES to confirm your order."
- Step 4: WHEN CUSTOMER REPLIES "YES" / "CONFIRM" / "OK" / "YEAS" / "HAAN":
  - Output confirmation text and append this JSON block at the very end:

```json
{{
  "action": "CREATE_ORDER",
  "customerName": "<Customer Name>",
  "deliveryAddress": "<Customer Delivery Address>",
  "items": [
    {{ "name": "<Product Name>", "quantity": <QtyNumber> }}
  ],
  "notes": "Cash on Delivery"
}}
```"""

def call_llm(messages):
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 400
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT_URL,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["choices"][0]["message"]["content"].strip()

def main():
    print("=" * 72)
    print("🌐 DUKAAN.AI RAW BASE MODEL TERMINAL CHAT")
    print(f"Model: {MODEL_NAME}")
    print(f"Endpoint: {ENDPOINT_URL}")
    print("System Prompt & Catalog: Mirrored from whatsapp/dukanBot.js")
    print("Commands: /clear or /reset (new chat) | /stock | /prompt | /quit")
    print("=" * 72)

    # Test connectivity
    print("\n⏳ Testing cloud endpoint connectivity...")
    try:
        test_payload = {
            "model": MODEL_NAME,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5
        }
        req = urllib.request.Request(
            ENDPOINT_URL,
            data=json.dumps(test_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
        print("✅ Cloud endpoint reachable and ready!\n")
    except Exception as err:
        print(f"⚠️ Warning: Could not reach endpoint ({err}).")
        print("Ensure Colab / Cloudflare tunnel is running.")

    system_prompt = build_system_prompt(DEFAULT_CATALOG)
    messages = [{"role": "system", "content": system_prompt}]

    while True:
        try:
            user_input = input("\n👤 Customer (You): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not user_input:
            continue

        lower = user_input.lower()
        if lower in ("/quit", "exit", "quit"):
            break
        if lower in ("/reset", "/clear", "clear", "reset"):
            os.system("clear" if os.name == "posix" else "cls")
            messages = [{"role": "system", "content": system_prompt}]
            print("=" * 72)
            print("🌐 DUKAAN.AI RAW BASE MODEL TERMINAL CHAT")
            print("🔄 Conversation reset! System prompt reloaded.")
            print("=" * 72)
            continue
        if lower in ("/stock", "stock"):
            print("\n📦 CURRENT STORE INVENTORY:\n" + build_inventory_text(DEFAULT_CATALOG))
            continue
        if lower in ("/prompt", "prompt"):
            print("\n📜 ACTIVE SYSTEM PROMPT (Copied from whatsapp/dukanBot.js):\n" + system_prompt)
            continue

        messages.append({"role": "user", "content": user_input})

        try:
            print("⏳ Model thinking...", end="\r", flush=True)
            reply = call_llm(messages)
            print(" " * 25, end="\r", flush=True)  # Clear "thinking..."
        except urllib.error.HTTPError as http_err:
            print(f"\n❌ HTTP Error {http_err.code}: {http_err.reason}")
            messages.pop()
            continue
        except Exception as err:
            print(f"\n❌ Error contacting model: {err}")
            messages.pop()
            continue

        messages.append({"role": "assistant", "content": reply})
        print(f"\n🤖 Raw Base Model ({MODEL_NAME}):\n{reply}")

        # Check for CREATE_ORDER JSON
        json_match = re.search(r"\{\s*\"action\"\s*:\s*\"CREATE_ORDER\"[\s\S]*\}", reply)
        if json_match:
            print("\n" + "🎉" * 20)
            print("✅ [BACKEND TRIGGERED] Valid CREATE_ORDER JSON Payload Detected!")
            print("🎉" * 20)

if __name__ == "__main__":
    main()
