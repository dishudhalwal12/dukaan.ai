import csv
import glob
import json
import os
import random
import re
from pathlib import Path

random.seed(2026)

# ============================================================================
# 1. BASE INDIAN KIRANA / BIGBASKET CATALOG (85+ VERIFIED FMCG SKUs)
# ============================================================================
MASTER_CATALOG = [
    # Staples, Atta, Rice & Dal
    {"name": "Aashirvaad Shudh Chakki Atta", "aliases": ["aashirvaad atta 5kg", "5kg atta", "chakki atta", "wheat flour 5kg"], "category": "Staples", "unit": "5kg pack", "price": 245},
    {"name": "Aashirvaad Shudh Chakki Atta", "aliases": ["aashirvaad atta 10kg", "10kg atta", "bada packet atta"], "category": "Staples", "unit": "10kg pack", "price": 475},
    {"name": "Aashirvaad Select Sharbati Atta", "aliases": ["sharbati atta", "aashirvaad select 5kg"], "category": "Staples", "unit": "5kg pack", "price": 310},
    {"name": "Pillsbury Chakki Fresh Atta", "aliases": ["pillsbury atta", "pillsbury 5kg"], "category": "Staples", "unit": "5kg pack", "price": 238},
    {"name": "Fortune Chakki Fresh Atta", "aliases": ["fortune atta 5kg", "fortune atta"], "category": "Staples", "unit": "5kg pack", "price": 230},
    {"name": "India Gate Basmati Rice Classic", "aliases": ["india gate basmati 5kg", "basmati rice 5kg", "india gate chawal"], "category": "Staples", "unit": "5kg pack", "price": 560},
    {"name": "India Gate Feast Rozzana Basmati Rice", "aliases": ["rozzana rice", "daily basmati rice 1kg", "1kg chawal"], "category": "Staples", "unit": "1kg pack", "price": 115},
    {"name": "Daawat Rozana Super Basmati Rice", "aliases": ["daawat rice", "daawat basmati 5kg"], "category": "Staples", "unit": "5kg pack", "price": 445},
    {"name": "Fortune Everyday Basmati Rice", "aliases": ["fortune rice 1kg", "fortune basmati"], "category": "Staples", "unit": "1kg pack", "price": 108},
    {"name": "Tata Sampann Unpolished Toor Dal", "aliases": ["toor dal", "arhar dal", "tata toor dal 1kg"], "category": "Staples", "unit": "1kg pack", "price": 165},
    {"name": "Tata Sampann Moong Dal", "aliases": ["moong dal", "yellow moong dal 1kg", "tata moong dal"], "category": "Staples", "unit": "1kg pack", "price": 142},
    {"name": "Tata Sampann Chana Dal", "aliases": ["chana dal", "1kg chana dal"], "category": "Staples", "unit": "1kg pack", "price": 110},
    {"name": "Tata Sampann Masoor Dal", "aliases": ["masoor dal", "red lentils 1kg"], "category": "Staples", "unit": "1kg pack", "price": 118},
    {"name": "Rajdhani Besan", "aliases": ["besan", "rajdhani besan 500g", "gram flour"], "category": "Staples", "unit": "500g pack", "price": 62},
    {"name": "Rajdhani Sooji (Rava)", "aliases": ["sooji", "rava 500g", "suji packet"], "category": "Staples", "unit": "500g pack", "price": 35},
    {"name": "Tata Sampann Thick Poha", "aliases": ["poha", "tata poha 500g", "kanda poha"], "category": "Staples", "unit": "500g pack", "price": 48},
    {"name": "Madhur Pure & Hygienic Sugar", "aliases": ["madhur sugar", "1kg cheeni", "sugar 1kg", "shakkar"], "category": "Staples", "unit": "1kg pack", "price": 55},
    {"name": "Tata Salt Vacuum Evaporated", "aliases": ["tata salt", "namak 1kg", "1 packet salt"], "category": "Staples", "unit": "1kg pack", "price": 28},
    {"name": "Tata Salt Lite Low Sodium", "aliases": ["tata salt lite", "low sodium salt"], "category": "Staples", "unit": "1kg pack", "price": 45},

    # Cooking Oils & Ghee
    {"name": "Fortune Sunlite Refined Sunflower Oil", "aliases": ["fortune oil", "sunflower oil 1L", "1 litre tel", "fortune sunlite"], "category": "Cooking Oil", "unit": "1L pouch", "price": 145},
    {"name": "Saffola Gold Blended Edible Oil", "aliases": ["saffola gold", "saffola oil 1L"], "category": "Cooking Oil", "unit": "1L pouch", "price": 175},
    {"name": "Fortune Kachi Ghani Pure Mustard Oil", "aliases": ["mustard oil", "sarso ka tel", "fortune mustard oil 1L"], "category": "Cooking Oil", "unit": "1L bottle", "price": 160},
    {"name": "Dhara Filtered Groundnut Oil", "aliases": ["groundnut oil", "dhara oil 1L", "peanut oil"], "category": "Cooking Oil", "unit": "1L pouch", "price": 185},
    {"name": "Amul Pure Cow Ghee", "aliases": ["amul ghee", "cow ghee 1L", "1 litre ghee"], "category": "Dairy", "unit": "1L tin", "price": 630},
    {"name": "Patanjali Cow's Ghee", "aliases": ["patanjali ghee", "500ml cow ghee"], "category": "Dairy", "unit": "500ml jar", "price": 340},
    {"name": "Mother Dairy Pure Healthy Ghee", "aliases": ["mother dairy ghee", "ghee 1L pouch"], "category": "Dairy", "unit": "1L pouch", "price": 595},

    # Dairy, Bread & Eggs
    {"name": "Amul Taaza Homogenised Toned Milk", "aliases": ["amul taaza", "amul milk 500ml", "half litre doodh", "toned milk"], "category": "Dairy", "unit": "500ml pouch", "price": 27},
    {"name": "Amul Gold Full Cream Milk", "aliases": ["amul gold", "full cream milk 1L", "1L amul doodh", "amul gold milk"], "category": "Dairy", "unit": "1L pack", "price": 66},
    {"name": "Mother Dairy Toned Milk", "aliases": ["mother dairy milk", "mother dairy 500ml"], "category": "Dairy", "unit": "500ml pouch", "price": 27},
    {"name": "Amul Masti Dahi", "aliases": ["amul dahi", "curd 400g", "dahi cup", "amul masti curd"], "category": "Dairy", "unit": "400g cup", "price": 35},
    {"name": "Mother Dairy Classic Curd", "aliases": ["mother dairy dahi", "1kg dahi", "curd 1kg"], "category": "Dairy", "unit": "1kg pouch", "price": 72},
    {"name": "Amul Masti Spiced Buttermilk", "aliases": ["chaas", "amul buttermilk", "masala chaas"], "category": "Dairy", "unit": "200ml pack", "price": 15},
    {"name": "Amul Pasteurised Butter", "aliases": ["amul butter 100g", "small butter", "makkhan"], "category": "Dairy", "unit": "100g pack", "price": 58},
    {"name": "Amul Pasteurised Butter (Large)", "aliases": ["amul butter 500g", "half kg butter", "big amul butter"], "category": "Dairy", "unit": "500g pack", "price": 285},
    {"name": "Amul Cheese Slices", "aliases": ["cheese slices", "amul cheese 200g", "cheese packet"], "category": "Dairy", "unit": "200g pack", "price": 140},
    {"name": "Mother Dairy Fresh Paneer", "aliases": ["paneer", "200g paneer", "mother dairy paneer"], "category": "Dairy", "unit": "200g pack", "price": 90},
    {"name": "Britannia 100% Whole Wheat Bread", "aliases": ["brown bread", "wheat bread", "britannia brown bread"], "category": "Bakery", "unit": "400g loaf", "price": 50},
    {"name": "Harvest Gold White Bread", "aliases": ["white bread", "harvest gold bread", "normal bread"], "category": "Bakery", "unit": "400g loaf", "price": 45},
    {"name": "Farm Fresh White Eggs", "aliases": ["6 eggs", "half dozen eggs", "ande 6 pcs", "egg pack"], "category": "Dairy", "unit": "6 pcs pack", "price": 48},
    {"name": "Farm Fresh White Eggs (Dozen)", "aliases": ["12 eggs", "one dozen eggs", "12 ande"], "category": "Dairy", "unit": "12 pcs pack", "price": 92},

    # Instant Food, Noodles & Sauces
    {"name": "Maggi 2-Minute Masala Noodles", "aliases": ["maggi", "small maggi", "70g maggi", "single maggi"], "category": "Instant Food", "unit": "70g pack", "price": 14},
    {"name": "Maggi 2-Minute Masala Noodles (4-Pack)", "aliases": ["maggi 4 pack", "280g maggi", "maggi family pack"], "category": "Instant Food", "unit": "280g pack", "price": 55},
    {"name": "Sunfeast YiPPee! Magic Masala Noodles", "aliases": ["yippee noodles", "yippee 4 pack"], "category": "Instant Food", "unit": "240g pack", "price": 50},
    {"name": "Quaker Oats", "aliases": ["quaker oats", "oats 1kg", "plain oats"], "category": "Instant Food", "unit": "1kg pouch", "price": 195},
    {"name": "Saffola Masala Oats Classic", "aliases": ["masala oats", "saffola oats 500g"], "category": "Instant Food", "unit": "500g pack", "price": 145},
    {"name": "Kellogg's Corn Flakes Original", "aliases": ["corn flakes", "kelloggs 475g"], "category": "Instant Food", "unit": "475g box", "price": 185},
    {"name": "Kissan Fresh Tomato Ketchup", "aliases": ["kissan ketchup", "tomato sauce", "ketchup bottle"], "category": "Sauces", "unit": "500g bottle", "price": 110},
    {"name": "Kissan Mixed Fruit Jam", "aliases": ["kissan jam", "mixed fruit jam 500g", "bread jam"], "category": "Sauces", "unit": "500g jar", "price": 160},
    {"name": "Ching's Secret Schezwan Chutney", "aliases": ["schezwan chutney", "chings schezwan"], "category": "Sauces", "unit": "250g jar", "price": 85},

    # Tea, Coffee & Beverages
    {"name": "Tata Tea Gold", "aliases": ["tata tea gold", "chai patti 250g", "tata tea"], "category": "Beverages", "unit": "250g pack", "price": 150},
    {"name": "Tata Tea Agni Strong", "aliases": ["tata agni tea", "strong chai patti"], "category": "Beverages", "unit": "250g pack", "price": 75},
    {"name": "Red Label Natural Care Tea", "aliases": ["red label tea", "red label 500g", "brooke bond red label"], "category": "Beverages", "unit": "500g pack", "price": 285},
    {"name": "Taj Mahal Tea", "aliases": ["taj mahal tea", "taj mahal 250g"], "category": "Beverages", "unit": "250g box", "price": 180},
    {"name": "Bru Instant Coffee", "aliases": ["bru coffee", "instant coffee 100g"], "category": "Beverages", "unit": "100g jar", "price": 215},
    {"name": "Nescafe Classic Instant Coffee", "aliases": ["nescafe", "nescafe classic 45g", "coffee jar"], "category": "Beverages", "unit": "45g jar", "price": 165},
    {"name": "Bournvita Health Drink", "aliases": ["bournvita", "cadbury bournvita 500g"], "category": "Beverages", "unit": "500g jar", "price": 240},
    {"name": "Horlicks Classic Malt", "aliases": ["horlicks", "horlicks 500g"], "category": "Beverages", "unit": "500g jar", "price": 255},
    {"name": "Thums Up Soft Drink", "aliases": ["thums up", "750ml thums up", "cold drink"], "category": "Beverages", "unit": "750ml bottle", "price": 40},
    {"name": "Sprite Lime Flavoured Soft Drink", "aliases": ["sprite", "750ml sprite"], "category": "Beverages", "unit": "750ml bottle", "price": 40},
    {"name": "Real Fruit Power Mixed Fruit Juice", "aliases": ["real juice", "mixed fruit juice 1L", "real 1L"], "category": "Beverages", "unit": "1L pack", "price": 125},

    # Biscuits, Snacks & Chocolates
    {"name": "Parle-G Original Gluco Biscuits", "aliases": ["parle g", "parle-g 250g", "gluco biscuit"], "category": "Biscuits", "unit": "250g pack", "price": 25},
    {"name": "Britannia Good Day Cashew Cookies", "aliases": ["good day biscuit", "cashew cookies", "good day"], "category": "Biscuits", "unit": "200g pack", "price": 40},
    {"name": "Britannia Marie Gold Biscuits", "aliases": ["marie gold", "chai biscuit", "britannia marie"], "category": "Biscuits", "unit": "250g pack", "price": 38},
    {"name": "Sunfeast Dark Fantasy Choco Fills", "aliases": ["dark fantasy", "choco fills"], "category": "Biscuits", "unit": "300g pack", "price": 120},
    {"name": "Oreo Chocolate Creme Biscuits", "aliases": ["oreo", "oreo biscuit"], "category": "Biscuits", "unit": "120g pack", "price": 35},
    {"name": "Haldiram's Aloo Bhujia", "aliases": ["aloo bhujia", "haldiram bhujia 200g"], "category": "Snacks", "unit": "200g pack", "price": 55},
    {"name": "Haldiram's Khatta Meetha", "aliases": ["khatta meetha", "haldiram namkeen 400g"], "category": "Snacks", "unit": "400g pack", "price": 95},
    {"name": "Lay's India's Magic Masala Chips", "aliases": ["blue lays", "magic masala lays", "lays chips"], "category": "Snacks", "unit": "50g pack", "price": 20},
    {"name": "Kurkure Masala Munch", "aliases": ["kurkure", "masala munch"], "category": "Snacks", "unit": "85g pack", "price": 20},
    {"name": "Cadbury Dairy Milk Silk", "aliases": ["dairy milk silk", "silk chocolate"], "category": "Snacks", "unit": "60g bar", "price": 85},

    # Spices & Dry Fruits
    {"name": "Everest Turmeric Powder (Haldi)", "aliases": ["haldi powder", "everest turmeric 100g", "haldi"], "category": "Spices", "unit": "100g pack", "price": 38},
    {"name": "Everest Kashmiri Lal Chilli Powder", "aliases": ["mirchi powder", "kashmiri lal mirch", "red chilli powder"], "category": "Spices", "unit": "100g pack", "price": 85},
    {"name": "MDH Coriander (Dhaniya) Powder", "aliases": ["dhaniya powder", "mdh coriander 100g"], "category": "Spices", "unit": "100g pack", "price": 42},
    {"name": "MDH Garam Masala", "aliases": ["garam masala", "mdh garam masala 100g"], "category": "Spices", "unit": "100g box", "price": 88},
    {"name": "Everest Chicken Masala", "aliases": ["chicken masala", "everest chicken masala"], "category": "Spices", "unit": "100g box", "price": 78},
    {"name": "Catch Black Pepper Powder", "aliases": ["kali mirch powder", "black pepper"], "category": "Spices", "unit": "50g sprinkler", "price": 65},
    {"name": "Tata Sampann California Almonds (Badam)", "aliases": ["badam 200g", "almonds", "california badam"], "category": "Dry Fruits", "unit": "200g pack", "price": 240},
    {"name": "Whole Farm Premium Cashews (Kaju)", "aliases": ["kaju 200g", "cashews"], "category": "Dry Fruits", "unit": "200g pack", "price": 265},

    # Household & Personal Care
    {"name": "Surf Excel Easy Wash Detergent Powder", "aliases": ["surf excel 1kg", "washing powder", "surf excel"], "category": "Household", "unit": "1kg pack", "price": 135},
    {"name": "Surf Excel Matic Top Load Liquid", "aliases": ["surf excel liquid", "matic liquid 1L"], "category": "Household", "unit": "1L pouch", "price": 210},
    {"name": "Ariel Complete Detergent Powder", "aliases": ["ariel 1kg", "ariel detergent"], "category": "Household", "unit": "1kg pack", "price": 225},
    {"name": "Vim Dishwash Liquid Gel", "aliases": ["vim liquid", "vim gel 500ml", "dishwash liquid"], "category": "Household", "unit": "500ml bottle", "price": 105},
    {"name": "Harpic Power Plus Toilet Cleaner", "aliases": ["harpic", "toilet cleaner 500ml"], "category": "Household", "unit": "500ml bottle", "price": 98},
    {"name": "Lizol Disinfectant Surface Floor Cleaner", "aliases": ["lizol", "floor cleaner 1L", "pochha liquid"], "category": "Household", "unit": "1L bottle", "price": 195},
    {"name": "Colgate Strong Teeth Toothpaste", "aliases": ["colgate 200g", "toothpaste", "colgate"], "category": "Personal Care", "unit": "200g tube", "price": 115},
    {"name": "Sensodyne Fresh Mint Toothpaste", "aliases": ["sensodyne", "sensodyne 70g"], "category": "Personal Care", "unit": "70g tube", "price": 130},
    {"name": "Dettol Original Bathing Soap", "aliases": ["dettol soap", "bathing soap", "dettol bar"], "category": "Personal Care", "unit": "125g bar", "price": 58},
    {"name": "Dettol Antiseptic Liquid", "aliases": ["dettol liquid 250ml", "antiseptic liquid"], "category": "Personal Care", "unit": "250ml bottle", "price": 132},
    {"name": "Dove Cream Beauty Bathing Bar", "aliases": ["dove soap", "dove 100g"], "category": "Personal Care", "unit": "100g bar", "price": 65},
    {"name": "Clinic Plus Strong & Long Shampoo", "aliases": ["clinic plus shampoo", "shampoo bottle"], "category": "Personal Care", "unit": "340ml bottle", "price": 190},
    {"name": "Parachute 100% Pure Coconut Oil", "aliases": ["parachute coconut oil", "hair oil 200ml", "nariyal tel"], "category": "Personal Care", "unit": "200ml bottle", "price": 95},
]


# ============================================================================
# 2. DOWNLOAD, INSPECT & EXTRACT USABLE DATA FROM THE 4 OPEN-SOURCE DATASETS
# ============================================================================
def load_and_inspect_open_source_datasets():
    """
    Downloads and inspects the 4 open-source datasets:
      1. bitext/Bitext-customer-support-llm-chatbot-training-dataset
      2. Sujalvc/hinglish-instruct-dataset
      3. ankithiman/colloquial-hinglish-conversations (and ankitdhiman/...)
      4. gauranggujrati/big-basket-products-dataset (CSV from data/raw/)
    Filters and returns usable English customer templates, Hinglish customer prefixes,
    and additional BigBasket Indian grocery SKUs.
    """
    print("=" * 72)
    print("🔍 STEP 1: DOWNLOADING & INSPECTING OPEN-SOURCE DATASETS FOR USABILITY")
    print("=" * 72)

    bitext_order_phrases = []
    bitext_cancel_phrases = []
    hinglish_customer_prefixes = []
    extra_bigbasket_skus = []

    try:
        from datasets import load_dataset
        hf_available = True
    except ImportError:
        print("⚠️  'datasets' package not installed. Run `pip install datasets` to enable live HF downloads.")
        hf_available = False

    # ------------------------------------------------------------------------
    # Dataset 1: bitext/Bitext-customer-support-llm-chatbot-training-dataset
    # Direct Link: https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset
    # ------------------------------------------------------------------------
    if hf_available:
        try:
            print("\n[1/4] Checking Bitext Customer Support Dataset (Hugging Face)...")
            ds_bitext = load_dataset("bitext/Bitext-customer-support-llm-chatbot-training-dataset", split="train")
            print(f"  -> Downloaded {len(ds_bitext):,} rows | Columns: {ds_bitext.column_names}")

            for row in ds_bitext:
                intent = str(row.get("intent", "")).lower()
                instruction = str(row.get("instruction", "")).strip()
                # Clean placeholder tags like {{Order Number}}
                clean_inst = re.sub(r"\{\{.*?\}\}", "", instruction).strip()
                if 15 <= len(clean_inst) <= 95:
                    if intent in ("place_order", "change_order", "check_item_availability"):
                        bitext_order_phrases.append(clean_inst)
                    elif intent in ("cancel_order",):
                        bitext_cancel_phrases.append(clean_inst)

            print(f"  -> USABILITY VERDICT: USABLE! Extracted {len(bitext_order_phrases):,} natural English order queries "
                  f"and {len(bitext_cancel_phrases):,} cancellation queries.")
        except Exception as e:
            print(f"  -> Bitext load skipped ({e}). Using built-in English templates.")

    # ------------------------------------------------------------------------
    # Dataset 2: Sujalvc/hinglish-instruct-dataset
    # Direct Link: https://huggingface.co/datasets/Sujalvc/hinglish-instruct-dataset
    # ------------------------------------------------------------------------
    if hf_available:
        try:
            print("\n[2/4] Checking Sujalvc/hinglish-instruct-dataset (Hugging Face)...")
            ds_sujal = load_dataset("Sujalvc/hinglish-instruct-dataset", split="train")
            print(f"  -> Downloaded {len(ds_sujal):,} rows | Columns: {ds_sujal.column_names}")

            usable_count = 0
            for row in ds_sujal:
                # Inspect user/input text only (NEVER assistant output, which is in Hinglish/casual)
                user_text = str(row.get("input", "") or row.get("instruction", "") or row.get("question", "")).strip()
                if 10 <= len(user_text) <= 80 and any(w in user_text.lower() for w in ["hai", "kya", "chahiye", "kitna", "batao", "karo", "bhai"]):
                    usable_count += 1
                    if len(hinglish_customer_prefixes) < 300:
                        hinglish_customer_prefixes.append(user_text)

            print(f"  -> USABILITY VERDICT: PARTIALLY USABLE (User inputs only). Found {usable_count:,} colloquial Hinglish "
                  f"user queries. Discarded assistant column so our bot stays 100% in professional English.")
        except Exception as e:
            print(f"  -> Sujalvc dataset load skipped ({e}).")

    # ------------------------------------------------------------------------
    # Dataset 3: ankithiman/colloquial-hinglish-conversations
    # Direct Link: Hugging Face Datasets Hub
    # ------------------------------------------------------------------------
    if hf_available:
        loaded_colloquial = False
        for repo_id in ["ankithiman/colloquial-hinglish-conversations", "ankitdhiman/colloquial-hinglish-conversations"]:
            try:
                print(f"\n[3/4] Checking {repo_id} (Hugging Face)...")
                ds_col = load_dataset(repo_id, split="train")
                print(f"  -> Downloaded {len(ds_col):,} rows | Columns: {ds_col.column_names}")
                loaded_colloquial = True
                break
            except Exception:
                continue
        if not loaded_colloquial:
            print("  -> USABILITY VERDICT: Repo not publicly accessible or requires auth token; safely using verified Hinglish Kirana corpus.")

    # ------------------------------------------------------------------------
    # Dataset 4: gauranggujrati/big-basket-products-dataset (Kaggle)
    # Direct Link: https://www.kaggle.com/datasets/gauranggujrati/big-basket-products-dataset
    # ------------------------------------------------------------------------
    print("\n[4/4] Checking BigBasket Products Dataset (data/raw/*.csv from Kaggle)...")
    csv_files = glob.glob("data/raw/*.csv") + glob.glob("*.csv")
    bb_csv = next((f for f in csv_files if "big" in f.lower() or "basket" in f.lower() or "product" in f.lower()), None)

    if bb_csv and os.path.exists(bb_csv):
        try:
            with open(bb_csv, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    p_name = (row.get("product") or row.get("ProductName") or "").strip()
                    p_cat = (row.get("category") or row.get("Category") or "Grocery").strip()
                    p_price_raw = row.get("sale_price") or row.get("Price") or row.get("market_price") or "0"
                    try:
                        p_price = int(float(p_price_raw))
                    except ValueError:
                        continue
                    if 10 <= p_price <= 900 and 5 <= len(p_name) <= 48:
                        extra_bigbasket_skus.append({
                            "name": p_name,
                            "aliases": [p_name.lower(), p_name.split()[0].lower()],
                            "category": p_cat.split("&")[0].strip()[:20] or "Staples",
                            "unit": "1 pack",
                            "price": p_price
                        })
                        if len(extra_bigbasket_skus) >= 120:
                            break
            print(f"  -> USABILITY VERDICT: USABLE! Loaded {len(extra_bigbasket_skus)} real Indian grocery SKUs from {bb_csv}.")
        except Exception as e:
            print(f"  -> Error reading {bb_csv}: {e}")
    else:
        print("  -> No local Kaggle CSV found in data/raw/ (Tip: run `kaggle datasets download -d gauranggujrati/big-basket-products-dataset -p data/raw --unzip`).")
        print(f"  -> Using built-in verified BigBasket catalog ({len(MASTER_CATALOG)} Indian Kirana SKUs).")

    if extra_bigbasket_skus:
        MASTER_CATALOG.extend(extra_bigbasket_skus)

    print("=" * 72 + "\n")
    return bitext_order_phrases, bitext_cancel_phrases


# ============================================================================
# 3. CATEGORY UPSELL MAP, NAMES & ADDRESSES
# ============================================================================
UPSELL_MAP = {
    "Staples": ["Fortune Sunlite Refined Sunflower Oil", "Tata Salt Vacuum Evaporated", "Everest Turmeric Powder (Haldi)"],
    "Cooking Oil": ["Aashirvaad Shudh Chakki Atta", "Tata Sampann Unpolished Toor Dal"],
    "Dairy": ["Britannia 100% Whole Wheat Bread", "Tata Tea Gold", "Parle-G Original Gluco Biscuits"],
    "Bakery": ["Amul Pasteurised Butter", "Amul Taaza Homogenised Toned Milk", "Kissan Mixed Fruit Jam"],
    "Instant Food": ["Kissan Fresh Tomato Ketchup", "Amul Cheese Slices"],
    "Beverages": ["Parle-G Original Gluco Biscuits", "Britannia Good Day Cashew Cookies", "Haldiram's Aloo Bhujia"],
    "Biscuits": ["Tata Tea Gold", "Amul Taaza Homogenised Toned Milk"],
    "Snacks": ["Thums Up Soft Drink", "Sprite Lime Flavoured Soft Drink"],
    "Spices": ["Fortune Sunlite Refined Sunflower Oil", "Tata Salt Vacuum Evaporated"],
    "Household": ["Vim Dishwash Liquid Gel", "Lizol Disinfectant Surface Floor Cleaner"],
    "Personal Care": ["Colgate Strong Teeth Toothpaste", "Dettol Original Bathing Soap"],
    "Dry Fruits": ["Amul Pure Cow Ghee", "Taj Mahal Tea"],
    "Sauces": ["Maggi 2-Minute Masala Noodles (4-Pack)", "Britannia 100% Whole Wheat Bread"],
}

CUSTOMER_NAMES = [
    "Rahul Sharma", "Priya Verma", "Amit Patel", "Neha Gupta", "Vikram Singh",
    "Anjali Nair", "Rohan Mehta", "Pooja Joshi", "Suresh Iyer", "Kavita Reddy",
    "Deepak Yadav", "Sneha Kulkarni", "Arjun Malhotra", "Meera Chatterjee", "Karan Kapoor",
    "Divya Bhatia", "Manish Tiwari", "Swati Mishra", "Nitin Agarwal", "Ritu Saxena",
    "Aditya Deshmukh", "Shruti Menon", "Gaurav Bansal", "Tanvi Hegde", "Siddharth Khanna",
    "Pallavi Sinha", "Harshvardhan Rao", "Ishita Mukherjee", "Varun Arora", "Kritika Jain",
    "Abhishek Pandey", "Nandini Sengupta", "Pranav Kulkarni", "Simran Kaur", "Rajeshwari Pillai",
    "Mayank Chauhan", "Ankita Choudhary", "Tushar Deshpande", "Bhavna Parekh", "Vivek Nambiar"
]

DELIVERY_ADDRESSES = [
    "Flat 302, Shanti Niketan Apartments, MG Road, Near Metro Station",
    "House No. 14, Lane 3, Green Park Extension, Behind Mother Dairy Booth",
    "B-45, Second Floor, Lajpat Nagar Part 2, Opposite Central Market",
    "Flat 104, Gokul Residency, Wakad, Near Datta Mandir",
    "Plot 22, Sector 15, Vashi, Near Mini Seashore",
    "C-12, Indiranagar 1st Stage, 100 Feet Road, Near CMH Park",
    "A-704, Sunshine Towers, Andheri West, Lokhandwala Circle",
    "House 88, Block D, Malviya Nagar, Near Geeta Bhawan",
    "Flat 2B, Palm Grove Society, Koramangala 4th Block",
    "H.No 56, Phase 3, Model Town, Near Gurudwara",
    "D-901, Emerald Heights, Sector 62, Noida",
    "Flat 503, Silver Oak Society, Powai, Near Hiranandani Hospital",
    "Villa 19, Green Valley Layout, Whitefield, Gate 2",
    "G-12, Ground Floor, Rajouri Garden Main Market Road",
    "Flat 408, Ashiana Greens, Ahinsa Khand 2, Indirapuram",
    "B-102, Prestige Shantiniketan, Hoodi Circle",
    "House 31, Sector 40, Gurgaon, Near Community Center",
    "Flat 6A, Lakeview Apartments, Salt Lake Sector 3",
    "C-404, Rohan Mithila, Viman Nagar, Near Symbiosis",
    "Flat 1102, My Home Avatar, Puppalaguda, Block C",
    "WhatsApp Location Pin: 28.5672 N, 77.2100 E (Gate 2, Vasant Kunj)",
    "WhatsApp Location Pin: 19.1136 N, 72.8697 E (Silver Oak Society, Powai)",
    "WhatsApp Location Pin: 12.9716 N, 77.5946 E (Brigade Road Cross, 2nd Floor)",
    "WhatsApp Location Pin: 18.5204 N, 73.8567 E (Kothrud Depot Lane, Flat 9)"
]


# ============================================================================
# 4. SYSTEM PROMPT & STRICT ENGLISH RESPONSE RENDERERS
# ============================================================================
def build_system_prompt(inventory_subset, out_of_stock_items=None):
    lines = []
    for item in inventory_subset:
        lines.append(
            f"- {item['name']} ({item['unit']}) | Category: {item['category']} | Price: Rs.{item['price']} | Status: IN_STOCK"
        )
    if out_of_stock_items:
        for item in out_of_stock_items:
            lines.append(
                f"- {item['name']} ({item['unit']}) | Category: {item['category']} | Price: Rs.{item['price']} | Status: OUT_OF_STOCK"
            )
    catalog_text = "\n".join(lines)

    return (
        "You are Dukaan.ai, a polite, professional WhatsApp sales assistant for an Indian neighborhood Kirana store.\n"
        "STRICT RULES:\n"
        "1. LANGUAGE: Always respond in clear, polite, professional English, regardless of whether the customer writes in English, Hinglish, or shorthand. Never reply in Hinglish.\n"
        "2. INVENTORY: Only offer IN_STOCK items from the LIVE INVENTORY below and quote exact INR (Rs.) catalog prices.\n"
        "3. TONE: Keep messages concise (1-3 sentences), natural, and helpful. Use at most 1 emoji. Zero robotic filler.\n"
        "4. ORDER FLOW:\n"
        "   - Confirm requested in-stock items and unit prices. If the customer has not shared their Name and Delivery Address yet, ask for them.\n"
        "   - Once items, Name, and Delivery Address are known, show a clean Order Summary with item totals and Grand Total, ending with: \"Reply YES to confirm your order.\"\n"
        "   - ONLY when the customer explicitly confirms (e.g., YES, CONFIRM, OK, HAAN), output a short English confirmation message followed by the strict CREATE_ORDER JSON block.\n\n"
        f"LIVE INVENTORY:\n{catalog_text}"
    )


def format_user_cart_text(cart, style="english_casual"):
    parts = []
    for entry in cart:
        qty = entry["quantity"]
        item = entry["item"]
        alias = random.choice(item["aliases"] + [item["name"]]) if style != "english_formal" else f"{item['name']} ({item['unit']})"

        if style == "shorthand":
            parts.append(f"{qty} {alias.lower()}")
        elif style == "hinglish":
            unit_word = random.choice(["", "packet ", "pkt ", "pcs "])
            parts.append(f"{qty} {unit_word}{alias}")
        else:
            parts.append(f"{qty} {alias}")

    if len(parts) == 1:
        return parts[0]
    if style == "hinglish":
        joiner = random.choice([" aur ", ", ", " and "])
        return ", ".join(parts[:-1]) + joiner + parts[-1]
    elif style == "shorthand":
        joiner = random.choice([", ", " + ", " & ", " "])
        return joiner.join(parts)
    else:
        return ", ".join(parts[:-1]) + " and " + parts[-1]


ENGLISH_ORDER_OPENERS = [
    "Hi, I'd like to order {items}.",
    "Hello, do you have {items} in stock? Need home delivery.",
    "Hey, can you send {items} please?",
    "Good morning, please pack {items} for delivery.",
    "Hi there, need {items} urgently.",
    "Can I get {items} delivered today?",
    "Hello! Looking to buy {items}. Are they available?",
    "Hi, please check if you have {items}.",
    "Hey, could you send {items} to my place?",
    "Need {items}. How much will that be?",
    "Good evening, I want to order {items}.",
    "Hi store, please send {items}.",
]

SHORTHAND_ORDER_OPENERS = [
    "{items}",
    "need {items}",
    "send {items} pls",
    "order: {items}",
    "hi {items} available?",
    "pls send {items} fast",
]

HINGLISH_ORDER_OPENERS = [
    "Bhaiya {items} bhej dena please.",
    "Hi, mujhe {items} chahiye tha.",
    "Bhai {items} hai kya stock mein? Order karna hai.",
    "Hello, {items} bhijwa do ghar pe.",
    "Bhaiya jaldi se {items} pack kar do.",
    "Are {items} mil jayega abhi? Delivery chahiye.",
    "Bhaiya {items} likh lo mere order mein.",
    "Hi, {items} bhejna hai, kitna bill hoga?",
]


def render_assistant_stock_confirmation(cart, upsell_item=None):
    item_strs = []
    running_total = 0
    for c in cart:
        qty = c["quantity"]
        it = c["item"]
        sub = qty * it["price"]
        running_total += sub
        if qty == 1:
            item_strs.append(f"1x {it['name']} ({it['unit']}) at Rs.{it['price']}")
        else:
            item_strs.append(f"{qty}x {it['name']} ({it['unit']}) at Rs.{it['price']} each (Rs.{sub})")

    joined_items = ", ".join(item_strs[:-1]) + (" and " + item_strs[-1] if len(item_strs) > 1 else item_strs[0])

    templates_no_upsell = [
        f"Yes, {joined_items} {'are' if len(cart)>1 else 'is'} available in stock (Subtotal: Rs.{running_total}). 🛒 Please share your Name and Delivery Address to place the order.",
        f"We have {joined_items} ready for delivery! The current total is Rs.{running_total}. Could you please provide your full Name and Delivery Address?",
        f"All requested items are in stock: {joined_items} (Rs.{running_total} total). 📦 Please reply with your Name and Delivery Address (or WhatsApp location pin).",
        f"Sure! I have noted {joined_items} for Rs.{running_total}. Please let me know your Name and Delivery Address so I can generate your final bill.",
        f"Great, {joined_items} {'are' if len(cart)>1 else 'is'} in stock right now. Please share your Name and complete Delivery Address to proceed with checkout.",
    ]

    if upsell_item:
        templates_upsell = [
            f"We have {joined_items} in stock (Rs.{running_total}). 🛒 Would you also like to add {upsell_item['name']} ({upsell_item['unit']}) for Rs.{upsell_item['price']}? Please share your Name and Delivery Address to proceed.",
            f"Yes, {joined_items} {'are' if len(cart)>1 else 'is'} available! By the way, we also have {upsell_item['name']} ({upsell_item['unit']}) in stock at Rs.{upsell_item['price']} if you need it. Please send your Name and Delivery Address.",
            f"I have added {joined_items} (Rs.{running_total}) to your cart. Would you like to include 1x {upsell_item['name']} ({upsell_item['unit']}) for Rs.{upsell_item['price']}? Please share your Name and Delivery Address.",
        ]
        return random.choice(templates_upsell)

    return random.choice(templates_no_upsell)


def render_order_summary(cart, customer_name, address, notes="Cash on Delivery"):
    lines = []
    grand_total = 0
    for c in cart:
        line_total = c["quantity"] * c["item"]["price"]
        grand_total += line_total
        lines.append(f"• {c['quantity']}x {c['item']['name']} ({c['item']['unit']}): Rs.{line_total}")
    summary_body = "\n".join(lines)

    headers = [
        f"Here is the Order Summary for {customer_name} ({address}):",
        f"Order Summary for {customer_name} | Delivery to: {address}",
        f"Please review your Order Summary for {customer_name} ({address}):",
    ]
    return (
        f"{random.choice(headers)}\n"
        f"{summary_body}\n"
        f"Grand Total: Rs.{grand_total} ({notes}). 📋\n"
        f"Reply YES to confirm your order."
    ), grand_total


def render_final_confirmation(cart, customer_name, address, grand_total, notes="Cash on Delivery"):
    order_json = {
        "action": "CREATE_ORDER",
        "customerName": customer_name,
        "deliveryAddress": address,
        "items": [{"name": c["item"]["name"], "quantity": c["quantity"]} for c in cart],
        "notes": notes
    }
    closing_templates = [
        f"Thank you, {customer_name}! Your order of Rs.{grand_total} is confirmed and will be out for delivery shortly. ✅",
        f"Order confirmed, {customer_name}! We are packing your items (Total: Rs.{grand_total}) for immediate delivery. ✅",
        f"Got it, {customer_name}! Your order totaling Rs.{grand_total} has been placed and will reach you soon. ✅",
        f"Your order for Rs.{grand_total} is confirmed, {customer_name}. Our delivery partner will bring it to your address shortly! ✅",
    ]
    return f"{random.choice(closing_templates)}\n```json\n{json.dumps(order_json, indent=2)}\n```"


# ============================================================================
# 5. CONVERSATION GENERATORS (BLENDING OPEN-SOURCE PHRASES + KIRANA FLOWS)
# ============================================================================
def gen_archetype_standard_order(user_lang="english", bitext_phrases=None):
    sampled = random.sample(MASTER_CATALOG, k=random.randint(9, 14))
    cart = [{"item": it, "quantity": random.randint(1, 3)} for it in sampled[:random.randint(1, 3)]]

    do_upsell = random.random() < 0.25
    upsell_item = None
    if do_upsell:
        cat = cart[0]["item"]["category"]
        candidates = UPSELL_MAP.get(cat, ["Tata Salt Vacuum Evaporated"])
        upsell_item = next((x for x in MASTER_CATALOG if x["name"] in candidates and x not in [c["item"] for c in cart]), None)
        if upsell_item and upsell_item not in sampled:
            sampled.append(upsell_item)

    sys_prompt = build_system_prompt(sampled)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)
    notes = random.choice(["Cash on Delivery", "Cash on Delivery", "UPI on Delivery", "Leave with security guard"])

    if user_lang == "english":
        style = random.choice(["english_casual", "english_formal"])
        items_str = format_user_cart_text(cart, style)
        if bitext_phrases and random.random() < 0.35:
            prefix = random.choice(bitext_phrases)
            user_t1 = f"{prefix} — I want to order {items_str}."
        else:
            user_t1 = random.choice(ENGLISH_ORDER_OPENERS).format(items=items_str)
    elif user_lang == "shorthand":
        user_t1 = random.choice(SHORTHAND_ORDER_OPENERS).format(items=format_user_cart_text(cart, "shorthand"))
    else:
        user_t1 = random.choice(HINGLISH_ORDER_OPENERS).format(items=format_user_cart_text(cart, "hinglish"))

    asst_t1 = render_assistant_stock_confirmation(cart, upsell_item=upsell_item)

    accept_upsell = (upsell_item is not None) and (random.random() < 0.40)
    if accept_upsell:
        cart.append({"item": upsell_item, "quantity": 1})
        if user_lang == "hinglish":
            user_t2 = f"Haan 1 {upsell_item['name']} bhi add kar do. Name: {customer_name}, Address: {address}"
        else:
            user_t2 = f"Yes please add 1 {upsell_item['name']} as well. My name is {customer_name}, deliver to {address}."
    else:
        if user_lang == "hinglish":
            user_t2 = random.choice([
                f"Bas yahi bhej do. {customer_name}, {address}",
                f"Name: {customer_name}, Address: {address}. Extra kuch nahi chahiye.",
                f"Mera naam {customer_name} hai, address {address}."
            ])
        else:
            user_t2 = random.choice([
                f"{customer_name}\n{address}",
                f"Name is {customer_name}. Please deliver to {address}.",
                f"No extra items needed. Deliver to {customer_name}, {address}.",
                f"{customer_name} - {address} ({notes})"
            ])

    asst_t2, grand_total = render_order_summary(cart, customer_name, address, notes)
    user_t3 = random.choice(["YES", "Confirm", "Yes please", "OK confirm", "Haan bhej do", "YES confirm order", "Ok"])
    asst_t3 = render_final_confirmation(cart, customer_name, address, grand_total, notes)

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


def gen_archetype_one_shot_fast_order():
    sampled = random.sample(MASTER_CATALOG, k=random.randint(8, 12))
    cart = [{"item": it, "quantity": random.randint(1, 3)} for it in sampled[:random.randint(1, 3)]]
    sys_prompt = build_system_prompt(sampled)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)
    notes = random.choice(["Cash on Delivery", "UPI on Delivery"])

    is_hinglish = random.random() < 0.35
    items_txt = format_user_cart_text(cart, "hinglish" if is_hinglish else "english_casual")

    if is_hinglish:
        user_t1 = random.choice([
            f"Bhaiya {items_txt} bhej do. Name: {customer_name}, Address: {address}",
            f"Hi, {items_txt} bhijwa dena. {customer_name}, {address}",
            f"Urgent {items_txt} chahiye. Deliver to {customer_name} at {address}."
        ])
    else:
        user_t1 = random.choice([
            f"Hi, please send {items_txt} to {customer_name}, {address}.",
            f"Hello! I need {items_txt}. Name: {customer_name}, Delivery Address: {address}.",
            f"Can you deliver {items_txt} right now? {customer_name}, {address} ({notes})."
        ])

    asst_t1, grand_total = render_order_summary(cart, customer_name, address, notes)
    user_t2 = random.choice(["YES", "Confirm", "Yes send it", "Haan confirm", "OK"])
    asst_t2 = render_final_confirmation(cart, customer_name, address, grand_total, notes)

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
        ]
    }


def gen_archetype_mid_order_cart_edit():
    sampled = random.sample(MASTER_CATALOG, k=10)
    cart = [
        {"item": sampled[0], "quantity": 1},
        {"item": sampled[1], "quantity": 2},
    ]
    extra_item = sampled[2]
    sys_prompt = build_system_prompt(sampled)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)

    user_t1 = f"Hi, please send {format_user_cart_text(cart, 'english_casual')} to {customer_name}, {address}."
    asst_t1, _ = render_order_summary(cart, customer_name, address)

    edit_type = random.choice(["change_qty", "add_item", "remove_item"])
    if edit_type == "change_qty":
        new_qty = random.randint(3, 5)
        cart[0]["quantity"] = new_qty
        user_t2 = random.choice([
            f"Wait, please make {cart[0]['item']['name']} {new_qty} packs instead of 1.",
            f"Actually change {cart[0]['item']['aliases'][0]} quantity to {new_qty}.",
            f"Arre {cart[0]['item']['aliases'][0]} 1 nahi {new_qty} kar do."
        ])
    elif edit_type == "add_item":
        cart.append({"item": extra_item, "quantity": 1})
        user_t2 = random.choice([
            f"Wait, also add 1 {extra_item['name']} to the bill.",
            f"Sorry, forgot to add 1 {extra_item['aliases'][0]}. Please include that too.",
            f"Bhaiya isme 1 {extra_item['aliases'][0]} aur jod do."
        ])
    else:
        removed = cart.pop()
        user_t2 = random.choice([
            f"Actually remove {removed['item']['name']}, just send the first item.",
            f"Cancel {removed['item']['aliases'][0]} from the list, keep the rest.",
            f"Wait {removed['item']['aliases'][0]} hata do, baki bhej do."
        ])

    asst_t2, new_total = render_order_summary(cart, customer_name, address)
    asst_t2 = "I have updated your cart. " + asst_t2
    user_t3 = random.choice(["YES", "Yes confirm now", "OK looks good, confirm", "Haan ab theek hai, bhej do"])
    asst_t3 = render_final_confirmation(cart, customer_name, address, new_total)

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


def gen_archetype_out_of_stock_swap():
    sampled = random.sample(MASTER_CATALOG, k=9)
    oos_item = sampled[0]
    in_stock = sampled[1:]
    same_cat = [x for x in MASTER_CATALOG if x["category"] == oos_item["category"] and x["name"] != oos_item["name"]]
    alt_item = same_cat[0] if same_cat else in_stock[0]
    if alt_item not in in_stock:
        in_stock[0] = alt_item

    second_valid_item = in_stock[1]
    sys_prompt = build_system_prompt(in_stock, out_of_stock_items=[oos_item])
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)

    is_hinglish = random.random() < 0.40
    if is_hinglish:
        user_t1 = f"Bhaiya 1 {oos_item['aliases'][0]} aur 2 {second_valid_item['aliases'][0]} bhej dena."
    else:
        user_t1 = f"Hi, can I order 1 {oos_item['name']} and 2 {second_valid_item['name']}?"

    asst_t1 = (
        f"Sorry, {oos_item['name']} ({oos_item['unit']}) is currently out of stock. "
        f"However, we have {alt_item['name']} ({alt_item['unit']}) at Rs.{alt_item['price']}, "
        f"and 2x {second_valid_item['name']} ({second_valid_item['unit']}) at Rs.{second_valid_item['price']} each in stock! 🛒 "
        f"Would you like the {alt_item['name']} instead? Please also share your Name and Delivery Address."
    )

    swap_accepted = random.random() < 0.70
    if swap_accepted:
        cart = [{"item": alt_item, "quantity": 1}, {"item": second_valid_item, "quantity": 2}]
        user_t2 = (
            f"Yes, send 1 {alt_item['name']} instead. Name: {customer_name}, Address: {address}."
            if not is_hinglish
            else f"Haan theek hai, 1 {alt_item['aliases'][0]} hi de do. {customer_name}, {address}"
        )
    else:
        cart = [{"item": second_valid_item, "quantity": 2}]
        user_t2 = (
            f"No, skip that and just send the 2 {second_valid_item['name']}. {customer_name}, {address}."
            if not is_hinglish
            else f"Rehne do, sirf 2 {second_valid_item['aliases'][0]} bhej do. {customer_name}, {address}"
        )

    asst_t2, grand_total = render_order_summary(cart, customer_name, address)
    user_t3 = random.choice(["YES", "Confirm", "Yes please", "OK"])
    asst_t3 = render_final_confirmation(cart, customer_name, address, grand_total)

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


def gen_archetype_faq_price_delivery_upi():
    sampled = random.sample(MASTER_CATALOG, k=9)
    it1, it2 = sampled[0], sampled[1]
    sys_prompt = build_system_prompt(sampled)

    scenario = random.choice(["price_only", "upi_delivery_question", "discount_bargain", "out_of_domain_guard"])

    if scenario == "price_only":
        user_t1 = random.choice([
            f"Hi, what is the price of {it1['name']} and {it2['name']}?",
            f"How much for {it1['aliases'][0]} and {it2['aliases'][0]}?",
            f"Bhaiya {it1['aliases'][0]} aur {it2['aliases'][0]} ka rate batana?"
        ])
        asst_t1 = (
            f"{it1['name']} ({it1['unit']}) is Rs.{it1['price']} and {it2['name']} ({it2['unit']}) is Rs.{it2['price']}. "
            f"Both are currently in stock. Would you like to place an order?"
        )
        user_t2 = random.choice([
            "Okay thanks, I will let you know in the evening.",
            "Alright, just checking prices right now. Thanks!",
            "Theek hai, main ghar pe pooch ke batata hoon."
        ])
        asst_t2 = "Sure! Feel free to message us anytime when you are ready to order."

    elif scenario == "upi_delivery_question":
        user_t1 = random.choice([
            f"Do you have {it1['aliases'][0]}? Also how long does delivery take and can I pay by UPI?",
            f"Bhaiya {it1['aliases'][0]} kitni der mein aayega? Aur GPay / PhonePe chalega delivery pe?"
        ])
        asst_t1 = (
            f"Yes, {it1['name']} ({it1['unit']}) is in stock for Rs.{it1['price']}. "
            f"We deliver within 20-30 minutes and accept both Cash and UPI on delivery. 🛵 "
            f"How many packs would you like, and what is your Name and Delivery Address?"
        )
        user_t2 = "Great, I will message my full list in 10 minutes."
        asst_t2 = "Sounds good! Send over your list whenever you are ready."

    elif scenario == "discount_bargain":
        user_t1 = random.choice([
            f"I want 2 {it1['name']}. Any discount if I buy 2?",
            f"Bhaiya 2 {it1['aliases'][0]} lene pe kuch kam karoge kya?"
        ])
        asst_t1 = (
            f"Our catalog prices are already discounted for neighborhood delivery, so {it1['name']} ({it1['unit']}) is fixed at Rs.{it1['price']} per pack (Rs.{it1['price']*2} for 2). "
            f"Please share your Name and Delivery Address if you would like to order."
        )
        user_t2 = "Okay no problem, I'll pass for now."
        asst_t2 = "No problem at all! Let us know if you need anything else today."

    else:
        fake_item = random.choice(["iPhone 16 charger", "paracetamol tablets", "petrol", "car battery"])
        user_t1 = f"Hi, do you have {fake_item} available for delivery?"
        asst_t1 = (
            f"Sorry, we do not carry {fake_item}. We only sell grocery and household items listed in our current store inventory, "
            f"such as {it1['name']} (Rs.{it1['price']}) and {it2['name']} (Rs.{it2['price']}). How can I help you with your groceries today?"
        )
        user_t2 = "Oh okay, got it. Thanks."
        asst_t2 = "You're welcome! Message us anytime for your daily grocery needs."

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
        ]
    }


def gen_archetype_cancelled_at_summary(bitext_cancel_phrases=None):
    sampled = random.sample(MASTER_CATALOG, k=8)
    cart = [{"item": sampled[0], "quantity": 2}]
    sys_prompt = build_system_prompt(sampled)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)

    user_t1 = f"Please send 2 {sampled[0]['name']} to {customer_name}, {address}."
    asst_t1, _ = render_order_summary(cart, customer_name, address)

    if bitext_cancel_phrases and random.random() < 0.50:
        user_t2 = random.choice(bitext_cancel_phrases)
    else:
        user_t2 = random.choice([
            "Wait, NO don't send it. My roommate already bought it.",
            "Cancel the order please, I don't need it now.",
            "Ruk jao bhaiya cancel kar do, abhi nahi chahiye."
        ])
    asst_t2 = f"No problem, {customer_name}! I have cancelled this order and nothing will be billed or dispatched. Message us anytime you need groceries."

    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
        ]
    }


def gen_archetype_business_insights():
    sampled = random.sample(MASTER_CATALOG, k=6)
    low1, low2, top1, top2, slow1, slow2 = sampled
    low1_qty, low2_qty = random.randint(1, 4), random.randint(1, 4)
    top1_sold, top2_sold = random.randint(30, 65), random.randint(25, 50)

    sys_prompt = (
        "You are Dukaan.ai Business Analyst. Analyze the store inventory snapshot and output "
        "ONLY a valid JSON array of 5 punchy actionable insights in English (each strictly under 20 words)."
    )
    user_prompt = (
        f"Inventory Snapshot:\n"
        f"- Critical Low Stock: {low1['name']} ({low1_qty} left), {low2['name']} ({low2_qty} left)\n"
        f"- High Velocity Today: {top1['name']} ({top1_sold} units sold), {top2['name']} ({top2_sold} units sold)\n"
        f"- Slow Moving (7 days): {slow1['name']} (28 in stock, Rs.{slow1['price']}), {slow2['name']} (19 in stock, Rs.{slow2['price']})"
    )
    insights = [
        f"Restock {low1['name']} urgently; only {low1_qty} units left before evening rush.",
        f"Reorder {low2['name']} from distributor today to avoid tomorrow morning stockouts.",
        f"{top1['name']} leads daily sales at {top1_sold} units; increase safety stock by 30%.",
        f"Cross-sell slow-moving {slow1['name']} with fast-moving {top2['name']} on WhatsApp.",
        f"Offer a small combo discount on {slow2['name']} to free up shelf working capital."
    ]
    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": json.dumps(insights, indent=2)}
        ]
    }


def gen_archetype_receipt_ocr():
    items = random.sample(MASTER_CATALOG, k=random.randint(3, 6))
    store_headers = [
        "SHREE GANESH SUPERMARKET - GSTIN 27AABCU9603R1ZM",
        "APNA BAZAAR KIRANA & GENERAL STORE - CASH MEMO",
        "LAXMI PROVISION STORE - PH: 98201XXXXX",
        "NEW FRIENDS DAILY NEEDS - TAX INVOICE"
    ]
    ocr_lines = [random.choice(store_headers), f"BILL NO: #{random.randint(1000,9999)}   DATE: 15-10-2026"]
    parsed_output = []

    for idx, it in enumerate(items, 1):
        qty = random.randint(1, 5)
        line_price = it["price"] * qty
        sep = random.choice(["   ", " .. ", " | ", " -- ", "  "])
        ocr_lines.append(f"{idx}. {it['name'][:28]}{sep}QTY:{qty}{sep}RS {line_price}.00")
        parsed_output.append({
            "name": it["name"],
            "quantity": qty,
            "price": line_price
        })

    ocr_lines.append("PAID VIA UPI - THANK YOU VISIT AGAIN")
    sys_prompt = (
        "You are Dukaan.ai Receipt OCR Parser. Extract all grocery line items from the raw receipt text "
        "and return ONLY a strict JSON array of objects with keys: \"name\", \"quantity\", and \"price\"."
    )
    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": "\n".join(ocr_lines)},
            {"role": "assistant", "content": json.dumps(parsed_output, indent=2)}
        ]
    }


# ============================================================================
# 6. MAIN EXECUTION: GENERATE 16,500 CONVERSATIONS
# ============================================================================
def main():
    bitext_order_phrases, bitext_cancel_phrases = load_and_inspect_open_source_datasets()
    dataset = []

    print("[1/8] Generating 4,000 English Multi-Turn Orders (Blended with Bitext Phrasing)...")
    for _ in range(4000):
        dataset.append(gen_archetype_standard_order(user_lang="english", bitext_phrases=bitext_order_phrases))

    print("[2/8] Generating 3,500 Hinglish User -> Strictly Professional English Bot Orders...")
    for _ in range(3500):
        dataset.append(gen_archetype_standard_order(user_lang="hinglish"))

    print("[3/8] Generating 1,500 Shorthand / Rapid-Fire WhatsApp Orders...")
    for _ in range(1500):
        dataset.append(gen_archetype_standard_order(user_lang="shorthand"))

    print("[4/8] Generating 2,000 One-Shot Fast Checkout Orders (Items + Address in Turn 1)...")
    for _ in range(2000):
        dataset.append(gen_archetype_one_shot_fast_order())

    print("[5/8] Generating 2,000 Mid-Order Cart Edit & Quantity Change Conversations...")
    for _ in range(2000):
        dataset.append(gen_archetype_mid_order_cart_edit())

    print("[6/8] Generating 1,200 Out-of-Stock Substitution Negotiations...")
    for _ in range(1200):
        dataset.append(gen_archetype_out_of_stock_swap())

    print("[7/8] Generating 1,300 Price/UPI/Delivery FAQs & Bitext Order Cancellation Guardrails...")
    for _ in range(850):
        dataset.append(gen_archetype_faq_price_delivery_upi())
    for _ in range(450):
        dataset.append(gen_archetype_cancelled_at_summary(bitext_cancel_phrases=bitext_cancel_phrases))

    print("[8/8] Generating 1,000 Secondary JSON Tasks (500 Business Insights + 500 Receipt OCR)...")
    for _ in range(500):
        dataset.append(gen_archetype_business_insights())
        dataset.append(gen_archetype_receipt_ocr())

    random.shuffle(dataset)
    total = len(dataset)

    splits = {
        "train.jsonl": dataset[:15000],
        "valid.jsonl": dataset[15000:15750],
        "test.jsonl": dataset[15750:16500],
    }

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    for filename, records in splits.items():
        filepath = out_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            for row in records:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"Saved {len(records):6d} examples -> {filepath}")

    print(f"\n✅ Done! Generated {total:,} total examples (15,000 train | 750 valid | 750 test).")


if __name__ == "__main__":
    main()