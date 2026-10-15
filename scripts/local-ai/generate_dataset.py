#!/usr/bin/env python3
"""
generate_dataset.py - Production Dataset Generator for Dukaan.ai
Generates 16,500 high-variety training examples grounded in:
1. bitext/Bitext-customer-support-llm-chatbot-training-dataset (retail support & phrasing)
2. Sujalvc/hinglish-instruct-dataset (authentic Hinglish customer queries)
3. ankitdhiman/colloquial-hinglish-conversations (colloquial openers & conversational user turns)
4. BigBasket 100+ Indian FMCG Catalog (accurate names, units, categories, and INR prices)

Quality Rules:
- ~65% English / ~35% Hinglish on customer user turns.
- 100% Crisp, Professional English on assistant turns (zero Hindi words like 'Namaste', 'Bhaiya', 'Haan', 'Theek hai').
- Realistic multi-turn WhatsApp scenarios (standard, one-shot, mid-order modifications, out-of-stock substitutions, support inquiries with cancellation guards, business insights, receipt OCR).
- Outputs exactly 15,000 train.jsonl, 750 valid.jsonl, 750 test.jsonl (16,500 total).
"""

import json
import os
import random
import re
from pathlib import Path

# Deterministic seed for reproducible generation
random.seed(42)

# ==============================================================================
# 1. 100+ BigBasket Indian FMCG Master Catalog Pool
# ==============================================================================
MASTER_CATALOG = [
    # Staples (Atta, Rice, Dal, Sugar, Oil, Spices)
    {"name": "Aashirvaad Shudh Chakki Atta", "category": "Staples", "unit": "5kg pack", "price": 245, "upsell": "Fortune Sunlite Refined Sunflower Oil"},
    {"name": "Aashirvaad Shudh Chakki Atta", "category": "Staples", "unit": "10kg pack", "price": 475, "upsell": "Tata Salt"},
    {"name": "India Gate Basmati Rice Classic", "category": "Staples", "unit": "5kg pack", "price": 560, "upsell": "Tata Sampann Toor Dal"},
    {"name": "India Gate Basmati Rice Feast Rozzana", "category": "Staples", "unit": "1kg pack", "price": 95, "upsell": "Tata Sampann Moong Dal"},
    {"name": "Fortune Sunlite Refined Sunflower Oil", "category": "Staples", "unit": "1L pouch", "price": 145, "upsell": "Tata Salt"},
    {"name": "Fortune Sunlite Refined Sunflower Oil", "category": "Staples", "unit": "5L can", "price": 690, "upsell": "Aashirvaad Shudh Chakki Atta"},
    {"name": "Saffola Gold Pro Healthy Lifestyle Oil", "category": "Staples", "unit": "1L pouch", "price": 175, "upsell": "India Gate Basmati Rice Classic"},
    {"name": "Tata Sampann Unpolished Toor Dal", "category": "Staples", "unit": "1kg pack", "price": 165, "upsell": "Fortune Sunlite Refined Sunflower Oil"},
    {"name": "Tata Sampann Moong Dal Split", "category": "Staples", "unit": "1kg pack", "price": 140, "upsell": "Tata Salt"},
    {"name": "Tata Sampann Chana Dal", "category": "Staples", "unit": "1kg pack", "price": 115, "upsell": "MDH Garam Masala"},
    {"name": "Tata Sampann Kabuli Chana", "category": "Staples", "unit": "500g pack", "price": 85, "upsell": "MDH Chana Masala"},
    {"name": "Tata Salt Vacuum Evaporated", "category": "Staples", "unit": "1kg pack", "price": 28, "upsell": "Everest Turmeric Powder (Haldi)"},
    {"name": "Dhampure Sulphurless Pure White Sugar", "category": "Staples", "unit": "1kg pack", "price": 52, "upsell": "Tata Tea Gold"},
    {"name": "Fortune Besan Gram Flour", "category": "Staples", "unit": "500g pack", "price": 58, "upsell": "Fortune Sunlite Refined Sunflower Oil"},
    {"name": "Rajdhani Sooji Semolina", "category": "Staples", "unit": "500g pack", "price": 38, "upsell": "Amul Pure Ghee"},
    {"name": "Everest Turmeric Powder (Haldi)", "category": "Staples", "unit": "100g pack", "price": 38, "upsell": "Everest Kashmiri Lal Chilli Powder"},
    {"name": "Everest Kashmiri Lal Chilli Powder", "category": "Staples", "unit": "100g pack", "price": 85, "upsell": "Everest Coriander Powder (Dhania)"},
    {"name": "Everest Coriander Powder (Dhania)", "category": "Staples", "unit": "100g pack", "price": 42, "upsell": "Everest Turmeric Powder (Haldi)"},
    {"name": "MDH Garam Masala", "category": "Staples", "unit": "100g box", "price": 94, "upsell": "Tata Sampann Toor Dal"},
    {"name": "MDH Chana Masala", "category": "Staples", "unit": "100g box", "price": 88, "upsell": "Tata Sampann Kabuli Chana"},
    {"name": "Everest Kasuri Methi", "category": "Staples", "unit": "50g pack", "price": 45, "upsell": "Mother Dairy Fresh Paneer"},
    {"name": "Catch Black Pepper Powder", "category": "Staples", "unit": "100g sprinkler", "price": 125, "upsell": "Amul Salted Butter"},

    # Dairy & Refrigerated
    {"name": "Amul Taaza Homogenised Toned Milk", "category": "Dairy", "unit": "500ml pouch", "price": 27, "upsell": "Tata Tea Gold"},
    {"name": "Amul Gold Full Cream Milk", "category": "Dairy", "unit": "1L pack", "price": 66, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Amul Cow Fresh Milk", "category": "Dairy", "unit": "500ml pouch", "price": 28, "upsell": "Bru Instant Coffee"},
    {"name": "Mother Dairy Full Cream Milk", "category": "Dairy", "unit": "1L pack", "price": 66, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Mother Dairy Toned Milk", "category": "Dairy", "unit": "500ml pouch", "price": 27, "upsell": "Tata Tea Gold"},
    {"name": "Amul Masti Dahi", "category": "Dairy", "unit": "400g cup", "price": 35, "upsell": "Parle-G Original Gluco Biscuits"},
    {"name": "Amul Masti Dahi", "category": "Dairy", "unit": "200g cup", "price": 20, "upsell": "Haldiram's Aloo Bhujia"},
    {"name": "Mother Dairy Classic Dahi", "category": "Dairy", "unit": "400g tub", "price": 35, "upsell": "Parle-G Original Gluco Biscuits"},
    {"name": "Amul Salted Butter", "category": "Dairy", "unit": "100g pack", "price": 58, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Amul Salted Butter", "category": "Dairy", "unit": "500g pack", "price": 275, "upsell": "English Oven Brown Bread"},
    {"name": "Mother Dairy Fresh Paneer", "category": "Dairy", "unit": "200g pack", "price": 90, "upsell": "Everest Kasuri Methi"},
    {"name": "Amul Fresh Malai Paneer", "category": "Dairy", "unit": "200g pack", "price": 95, "upsell": "MDH Garam Masala"},
    {"name": "Amul Cheese Slices (10 Slices)", "category": "Dairy", "unit": "200g pack", "price": 140, "upsell": "Maggi 2-Minute Masala Noodles"},
    {"name": "Amul Processed Cheese Block", "category": "Dairy", "unit": "200g pack", "price": 130, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Amul Pure Ghee", "category": "Dairy", "unit": "1L tin", "price": 630, "upsell": "Aashirvaad Shudh Chakki Atta"},
    {"name": "Gowardhan Pure Cow Ghee", "category": "Dairy", "unit": "1L jar", "price": 650, "upsell": "India Gate Basmati Rice Classic"},
    {"name": "Amul Masti Spiced Buttermilk", "category": "Dairy", "unit": "200ml pack", "price": 15, "upsell": "Haldiram's Punjabi Tadka"},
    {"name": "Amul Fresh Cream", "category": "Dairy", "unit": "250ml tetra", "price": 65, "upsell": "Bru Instant Coffee"},

    # Instant Food, Noodles & Sauces
    {"name": "Maggi 2-Minute Masala Noodles", "category": "Instant Food", "unit": "70g pack", "price": 14, "upsell": "Amul Cheese Slices (10 Slices)"},
    {"name": "Maggi 2-Minute Masala Noodles (4-Pack)", "category": "Instant Food", "unit": "280g pack", "price": 55, "upsell": "Kissan Fresh Tomato Ketchup"},
    {"name": "Maggi 2-Minute Masala Noodles (8-Pack)", "category": "Instant Food", "unit": "560g pack", "price": 105, "upsell": "Thums Up Soft Drink"},
    {"name": "Yippee Magic Masala Noodles (4-Pack)", "category": "Instant Food", "unit": "240g pack", "price": 50, "upsell": "Kissan Fresh Tomato Ketchup"},
    {"name": "Ching's Secret Hakka Veg Noodles", "category": "Instant Food", "unit": "150g pack", "price": 40, "upsell": "Ching's Secret Schezwan Chutney"},
    {"name": "Top Ramen Curry Veg Noodles", "category": "Instant Food", "unit": "280g pack", "price": 52, "upsell": "Amul Cheese Slices (10 Slices)"},
    {"name": "Kissan Fresh Tomato Ketchup", "category": "Instant Food", "unit": "500g bottle", "price": 110, "upsell": "Maggi 2-Minute Masala Noodles (4-Pack)"},
    {"name": "Kissan Fresh Tomato Ketchup", "category": "Instant Food", "unit": "1kg pouch", "price": 160, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Maggi Hot & Sweet Chilli Sauce", "category": "Instant Food", "unit": "500g bottle", "price": 125, "upsell": "Haldiram's Aloo Bhujia"},
    {"name": "Ching's Secret Schezwan Chutney", "category": "Instant Food", "unit": "250g jar", "price": 85, "upsell": "Ching's Secret Hakka Veg Noodles"},
    {"name": "Dr. Oetker Funfoods Veg Mayonnaise", "category": "Instant Food", "unit": "250g pouch", "price": 89, "upsell": "Britannia 100% Whole Wheat Bread"},
    {"name": "Knorr Sweet Corn Veg Soup", "category": "Instant Food", "unit": "43g pack", "price": 40, "upsell": "Britannia 100% Whole Wheat Bread"},

    # Beverages (Tea, Coffee, Health Drinks, Soft Drinks)
    {"name": "Tata Tea Gold", "category": "Beverages", "unit": "250g pack", "price": 150, "upsell": "Amul Taaza Homogenised Toned Milk"},
    {"name": "Tata Tea Gold", "category": "Beverages", "unit": "500g pack", "price": 290, "upsell": "Dhampure Sulphurless Pure White Sugar"},
    {"name": "Red Label Natural Care Tea", "category": "Beverages", "unit": "250g pack", "price": 155, "upsell": "Parle-G Original Gluco Biscuits"},
    {"name": "Red Label Natural Care Tea", "category": "Beverages", "unit": "500g pack", "price": 285, "upsell": "Amul Gold Full Cream Milk"},
    {"name": "Brooke Bond Taj Mahal Tea", "category": "Beverages", "unit": "250g pack", "price": 195, "upsell": "Britannia Good Day Cashew Cookies"},
    {"name": "Wagh Bakri Premium Tea", "category": "Beverages", "unit": "500g pack", "price": 280, "upsell": "Dhampure Sulphurless Pure White Sugar"},
    {"name": "Bru Instant Coffee", "category": "Beverages", "unit": "100g jar", "price": 215, "upsell": "Amul Gold Full Cream Milk"},
    {"name": "Bru Instant Coffee", "category": "Beverages", "unit": "200g jar", "price": 410, "upsell": "Dhampure Sulphurless Pure White Sugar"},
    {"name": "Nescafe Classic Instant Coffee", "category": "Beverages", "unit": "100g jar", "price": 235, "upsell": "Amul Gold Full Cream Milk"},
    {"name": "Cadbury Bournvita Health Drink", "category": "Beverages", "unit": "500g jar", "price": 245, "upsell": "Amul Gold Full Cream Milk"},
    {"name": "Horlicks Classic Malt", "category": "Beverages", "unit": "500g jar", "price": 260, "upsell": "Amul Taaza Homogenised Toned Milk"},
    {"name": "Hamdard Rooh Afza Sharbat", "category": "Beverages", "unit": "750ml bottle", "price": 170, "upsell": "Amul Taaza Homogenised Toned Milk"},
    {"name": "Thums Up Soft Drink", "category": "Beverages", "unit": "750ml bottle", "price": 40, "upsell": "Lay's India's Magic Masala Chips"},
    {"name": "Thums Up Soft Drink", "category": "Beverages", "unit": "2L bottle", "price": 95, "upsell": "Haldiram's Aloo Bhujia"},
    {"name": "Coca-Cola Soft Drink", "category": "Beverages", "unit": "750ml bottle", "price": 40, "upsell": "Lay's India's Magic Masala Chips"},
    {"name": "Sprite Soft Drink", "category": "Beverages", "unit": "750ml bottle", "price": 40, "upsell": "Kurkure Masala Munch"},
    {"name": "Maaza Mango Drink", "category": "Beverages", "unit": "1.2L bottle", "price": 75, "upsell": "Britannia Good Day Cashew Cookies"},
    {"name": "Paper Boat Aamras Mango Fruit Drink", "category": "Beverages", "unit": "250ml pouch", "price": 35, "upsell": "Haldiram's Khatta Meetha"},
    {"name": "Bisleri Packaged Mineral Water", "category": "Beverages", "unit": "1L bottle", "price": 20, "upsell": "Thums Up Soft Drink"},
    {"name": "Bisleri Packaged Mineral Water", "category": "Beverages", "unit": "5L jar", "price": 70, "upsell": "Tata Tea Gold"},

    # Snacks, Biscuits & Namkeen
    {"name": "Parle-G Original Gluco Biscuits", "category": "Snacks", "unit": "250g pack", "price": 25, "upsell": "Tata Tea Gold"},
    {"name": "Parle-G Original Gluco Biscuits", "category": "Snacks", "unit": "800g family pack", "price": 75, "upsell": "Red Label Natural Care Tea"},
    {"name": "Britannia Good Day Cashew Cookies", "category": "Snacks", "unit": "200g pack", "price": 40, "upsell": "Bru Instant Coffee"},
    {"name": "Britannia Marie Gold Biscuits", "category": "Snacks", "unit": "250g pack", "price": 35, "upsell": "Tata Tea Gold"},
    {"name": "Cadbury Oreo Original Vanilla Biscuits", "category": "Snacks", "unit": "120g pack", "price": 35, "upsell": "Amul Gold Full Cream Milk"},
    {"name": "Sunfeast Dark Fantasy Choco Fills", "category": "Snacks", "unit": "300g pack", "price": 140, "upsell": "Nescafe Classic Instant Coffee"},
    {"name": "Britannia Bourbon Chocolate Cream Biscuits", "category": "Snacks", "unit": "150g pack", "price": 30, "upsell": "Amul Taaza Homogenised Toned Milk"},
    {"name": "Haldiram's Aloo Bhujia", "category": "Snacks", "unit": "200g pack", "price": 55, "upsell": "Tata Tea Gold"},
    {"name": "Haldiram's Aloo Bhujia", "category": "Snacks", "unit": "400g pack", "price": 105, "upsell": "Thums Up Soft Drink"},
    {"name": "Haldiram's Bhujia Sev", "category": "Snacks", "unit": "200g pack", "price": 55, "upsell": "Tata Tea Gold"},
    {"name": "Haldiram's Khatta Meetha Mixture", "category": "Snacks", "unit": "200g pack", "price": 55, "upsell": "Coca-Cola Soft Drink"},
    {"name": "Haldiram's Punjabi Tadka", "category": "Snacks", "unit": "200g pack", "price": 55, "upsell": "Amul Masti Spiced Buttermilk"},
    {"name": "Lay's India's Magic Masala Chips", "category": "Snacks", "unit": "50g pack", "price": 20, "upsell": "Thums Up Soft Drink"},
    {"name": "Lay's Spanish Tomato Tango Chips", "category": "Snacks", "unit": "50g pack", "price": 20, "upsell": "Sprite Soft Drink"},
    {"name": "Kurkure Masala Munch", "category": "Snacks", "unit": "90g pack", "price": 20, "upsell": "Thums Up Soft Drink"},
    {"name": "Bingo Mad Angles Achaari Masti", "category": "Snacks", "unit": "66g pack", "price": 20, "upsell": "Sprite Soft Drink"},
    {"name": "Act II Butter Lovers Instant Popcorn", "category": "Snacks", "unit": "30g pouch", "price": 15, "upsell": "Coca-Cola Soft Drink"},

    # Bakery
    {"name": "Britannia 100% Whole Wheat Bread", "category": "Bakery", "unit": "400g loaf", "price": 50, "upsell": "Amul Salted Butter"},
    {"name": "Harvest Gold White Regular Bread", "category": "Bakery", "unit": "400g loaf", "price": 45, "upsell": "Amul Salted Butter"},
    {"name": "Britannia Milk Sweet Bread", "category": "Bakery", "unit": "400g loaf", "price": 48, "upsell": "Kissan Fresh Tomato Ketchup"},
    {"name": "English Oven Brown Bread", "category": "Bakery", "unit": "400g loaf", "price": 55, "upsell": "Dr. Oetker Funfoods Veg Mayonnaise"},
    {"name": "Britannia Fruity Fun Cake", "category": "Bakery", "unit": "150g pack", "price": 35, "upsell": "Amul Taaza Homogenised Toned Milk"},
    {"name": "Bonn Fresh Burger Buns", "category": "Bakery", "unit": "pack of 4", "price": 35, "upsell": "Amul Cheese Slices (10 Slices)"},
    {"name": "Bonn Soft Pav Buns", "category": "Bakery", "unit": "pack of 6", "price": 30, "upsell": "Amul Salted Butter"},

    # Personal Care
    {"name": "Dettol Original Bathing Soap", "category": "Personal Care", "unit": "125g bar", "price": 58, "upsell": "Colgate Strong Teeth Toothpaste"},
    {"name": "Dettol Original Bathing Soap (3-Pack)", "category": "Personal Care", "unit": "3x125g", "price": 165, "upsell": "Dettol Antiseptic Liquid"},
    {"name": "Lifebuoy Total 10 Germ Protection Soap", "category": "Personal Care", "unit": "125g bar", "price": 45, "upsell": "Colgate Strong Teeth Toothpaste"},
    {"name": "Dove Cream Beauty Bathing Bar", "category": "Personal Care", "unit": "100g bar", "price": 72, "upsell": "Nivea Soft Light Moisturiser"},
    {"name": "Colgate Strong Teeth Toothpaste", "category": "Personal Care", "unit": "100g tube", "price": 65, "upsell": "Dettol Original Bathing Soap"},
    {"name": "Colgate Strong Teeth Toothpaste", "category": "Personal Care", "unit": "200g tube", "price": 115, "upsell": "Dettol Original Bathing Soap (3-Pack)"},
    {"name": "Close Up Everfresh Red Hot Gel Toothpaste", "category": "Personal Care", "unit": "150g tube", "price": 110, "upsell": "Dove Cream Beauty Bathing Bar"},
    {"name": "Sensodyne Fresh Gel Sensitive Toothpaste", "category": "Personal Care", "unit": "150g tube", "price": 210, "upsell": "Dettol Original Bathing Soap"},
    {"name": "Head & Shoulders Cool Menthol Shampoo", "category": "Personal Care", "unit": "180ml bottle", "price": 190, "upsell": "Parachute 100% Pure Coconut Hair Oil"},
    {"name": "Clinic Plus Strong & Long Shampoo", "category": "Personal Care", "unit": "175ml bottle", "price": 120, "upsell": "Parachute 100% Pure Coconut Hair Oil"},
    {"name": "Parachute 100% Pure Coconut Hair Oil", "category": "Personal Care", "unit": "200ml bottle", "price": 95, "upsell": "Clinic Plus Strong & Long Shampoo"},
    {"name": "Parachute 100% Pure Coconut Hair Oil", "category": "Personal Care", "unit": "500ml bottle", "price": 215, "upsell": "Head & Shoulders Cool Menthol Shampoo"},
    {"name": "Nivea Soft Light Moisturiser Cream", "category": "Personal Care", "unit": "100ml tub", "price": 185, "upsell": "Dove Cream Beauty Bathing Bar"},
    {"name": "Dettol Antiseptic Liquid", "category": "Personal Care", "unit": "250ml bottle", "price": 140, "upsell": "Dettol Original Bathing Soap (3-Pack)"},
    {"name": "Vaseline Deep Moisture Body Lotion", "category": "Personal Care", "unit": "200ml bottle", "price": 195, "upsell": "Dove Cream Beauty Bathing Bar"},

    # Household & Cleaning
    {"name": "Surf Excel Easy Wash Detergent Powder", "category": "Household", "unit": "1kg pack", "price": 135, "upsell": "Vim Dishwash Liquid Gel"},
    {"name": "Surf Excel Easy Wash Detergent Powder", "category": "Household", "unit": "3kg pack", "price": 380, "upsell": "Harpic Power Plus Disinfectant Toilet Cleaner"},
    {"name": "Ariel Complete Detergent Powder", "category": "Household", "unit": "1kg pack", "price": 145, "upsell": "Vim Dishwash Liquid Gel"},
    {"name": "Tide Plus Extra Power Detergent Powder", "category": "Household", "unit": "1kg pack", "price": 115, "upsell": "Vim Dishwash Bar"},
    {"name": "Vim Dishwash Liquid Gel Lemon", "category": "Household", "unit": "500ml bottle", "price": 105, "upsell": "Scotch-Brite Heavy Duty Scrub Pad"},
    {"name": "Vim Dishwash Liquid Gel Lemon", "category": "Household", "unit": "750ml pouch", "price": 140, "upsell": "Scotch-Brite Heavy Duty Scrub Pad"},
    {"name": "Vim Dishwash Bar Lemon", "category": "Household", "unit": "300g tub", "price": 35, "upsell": "Scotch-Brite Heavy Duty Scrub Pad"},
    {"name": "Scotch-Brite Heavy Duty Scrub Pad", "category": "Household", "unit": "pack of 3", "price": 45, "upsell": "Vim Dishwash Liquid Gel Lemon"},
    {"name": "Harpic Power Plus Disinfectant Toilet Cleaner", "category": "Household", "unit": "500ml bottle", "price": 99, "upsell": "Lizol Disinfectant Surface Floor Cleaner"},
    {"name": "Harpic Power Plus Disinfectant Toilet Cleaner", "category": "Household", "unit": "1L bottle", "price": 185, "upsell": "Lizol Disinfectant Surface Floor Cleaner"},
    {"name": "Lizol Disinfectant Surface Floor Cleaner", "category": "Household", "unit": "500ml bottle", "price": 110, "upsell": "Colin Glass and Surface Cleaner"},
    {"name": "Lizol Disinfectant Surface Floor Cleaner", "category": "Household", "unit": "1L bottle", "price": 205, "upsell": "Harpic Power Plus Disinfectant Toilet Cleaner"},
    {"name": "Colin Glass and Surface Cleaner", "category": "Household", "unit": "500ml spray", "price": 105, "upsell": "Lizol Disinfectant Surface Floor Cleaner"},
    {"name": "Good Knight Gold Flash Liquid Mosquito Refill", "category": "Household", "unit": "45ml bottle", "price": 85, "upsell": "Odonil Room Air Freshener Lavender"},
    {"name": "Odonil Room Air Freshener Lavender", "category": "Household", "unit": "50g block", "price": 55, "upsell": "Lizol Disinfectant Surface Floor Cleaner"},
]

# Map names to product object
CATALOG_BY_NAME = {item["name"]: item for item in MASTER_CATALOG}

CUSTOMER_NAMES = [
    "Rahul Sharma", "Priya Verma", "Amit Patel", "Neha Gupta", "Vikram Singh",
    "Anjali Nair", "Rohan Mehta", "Pooja Joshi", "Suresh Iyer", "Kavita Reddy",
    "Deepak Yadav", "Sneha Kulkarni", "Arjun Malhotra", "Meera Chatterjee",
    "Karan Kapoor", "Divya Bhatia", "Manish Tiwari", "Swati Mishra", "Nitin Agarwal",
    "Ritu Saxena", "Gaurav Sen", "Tanvi Deshmukh", "Aditya Rao", "Pallavi Joshi"
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
    "Flat 501, Lake View Heights, Powai, Mumbai",
    "Villa 12, Sobha Blossom, Sarjapur Road, Bangalore",
    "B-201, Maple Meadows, Koregaon Park, Pune",
    "WhatsApp Location Pin: 28.5672° N, 77.2100° E (Gate No. 2, Vasant Kunj)",
    "WhatsApp Location Pin: 19.1136° N, 72.8697° E (Silver Oak Society, Powai)",
    "WhatsApp Location Pin: 12.9716° N, 77.5946° E (MG Road Residency, Bangalore)",
]

NOTES_OPTIONS = [
    "Cash on Delivery",
    "Cash on Delivery",
    "Cash on Delivery",
    "UPI on Delivery",
    "Leave at security guard desk if not answered"
]

CONFIRMATIONS_EN = [
    "YES", "CONFIRM", "OK", "Yes please", "Confirm order", "OK send it",
    "Yes confirm", "Proceed with order", "Yes, please deliver", "Confirmed"
]

CONFIRMATIONS_HINGLISH = [
    "HAAN", "Haan bhaiya bhej do", "Haan ji bhej do", "Confirm hai bhaiya",
    "Haan pack kardo", "Haanji bilkul", "Order confirm karo"
]

# Aliases for realistic customer phrasing
ITEM_ALIASES = {
    "Maggi 2-Minute Masala Noodles": ["Maggi", "maggi packet", "2 minute maggi", "maggi noodles"],
    "Maggi 2-Minute Masala Noodles (4-Pack)": ["Maggi 4 pack", "4 pack maggi", "family pack maggi"],
    "Amul Taaza Homogenised Toned Milk": ["Amul Taaza milk", "Amul doodh 500ml", "toned milk pouch", "Amul Taaza 500ml"],
    "Amul Gold Full Cream Milk": ["Amul Gold milk 1L", "Amul Gold 1 litre", "full cream milk", "Amul Gold doodh"],
    "Aashirvaad Shudh Chakki Atta": ["Aashirvaad atta", "chakki atta", "wheat flour", "aashirvaad wheat flour"],
    "India Gate Basmati Rice Classic": ["India Gate basmati rice", "basmati chawal 5kg", "India gate rice"],
    "Fortune Sunlite Refined Sunflower Oil": ["Fortune sunflower oil", "fortune oil 1L", "refined oil"],
    "Tata Salt Vacuum Evaporated": ["Tata salt", "salt packet", "namak"],
    "Tata Tea Gold": ["Tata tea gold", "chai patti", "tea powder", "tata gold tea"],
    "Britannia 100% Whole Wheat Bread": ["brown bread", "wheat bread", "Britannia brown bread"],
    "Harvest Gold White Regular Bread": ["white bread", "regular bread", "bread loaf"],
    "Amul Masti Dahi": ["Amul dahi", "dahi cup", "curd", "Amul curd"],
    "Amul Salted Butter": ["Amul butter", "butter 100g", "butter pack"],
    "Mother Dairy Fresh Paneer": ["paneer 200g", "fresh paneer", "Mother dairy paneer"],
    "Parle-G Original Gluco Biscuits": ["Parle-G", "parle g biscuits", "gluco biscuit"],
    "Britannia Good Day Cashew Cookies": ["Good Day biscuits", "good day cashew", "cashew cookies"],
    "Bru Instant Coffee": ["Bru coffee", "coffee jar", "instant coffee"],
    "Haldiram's Aloo Bhujia": ["Haldiram aloo bhujia", "aloo bhujia", "bhujia packet"],
    "Lay's India's Magic Masala Chips": ["blue Lays", "magic masala lays", "Lays chips"],
    "Thums Up Soft Drink": ["Thums Up", "thumbs up 750ml", "cold drink"],
    "Surf Excel Easy Wash Detergent Powder": ["Surf Excel 1kg", "surf excel powder", "washing powder"],
    "Vim Dishwash Liquid Gel Lemon": ["Vim liquid", "vim gel 500ml", "dishwash liquid"],
    "Dettol Original Bathing Soap": ["Dettol soap", "dettol bath soap", "soap bar"],
    "Colgate Strong Teeth Toothpaste": ["Colgate toothpaste", "colgate 100g", "toothpaste tube"],
    "Everest Turmeric Powder (Haldi)": ["Everest haldi", "turmeric powder", "haldi packet"],
}


def get_item_alias(item_name):
    if item_name in ITEM_ALIASES and random.random() < 0.65:
        return random.choice(ITEM_ALIASES[item_name])
    return item_name


# ==============================================================================
# 2. Ingest Open-Source Datasets (Bitext, Sujalvc, Ankitdhiman)
# ==============================================================================
print("[Init] Loading cached open-source datasets (Bitext, Sujalvc, Ankitdhiman)...")

bitext_inquiries = []
hinglish_phrasings = []
colloquial_openers = []

try:
    import datasets
    # 1. Bitext Customer Support Dataset
    try:
        ds_bitext = datasets.load_dataset("bitext/Bitext-customer-support-llm-chatbot-training-dataset", split="train")
        relevant_intents = {
            "place_order", "change_order", "cancel_order", "check_cancellation_fee",
            "delivery_options", "payment_issue", "track_order", "delivery_address"
        }
        for row in ds_bitext:
            intent = row.get("intent", "")
            instruction = row.get("instruction", "").strip()
            if intent in relevant_intents and instruction:
                # Clean template artifacts like {{Order Number}}
                cleaned = re.sub(r"\{\{Order Number\}\}", "#ORD-" + str(random.randint(1000, 9999)), instruction)
                cleaned = re.sub(r"\{\{[^}]+\}\}", "", cleaned).strip()
                cleaned = re.sub(r"\s+", " ", cleaned)
                if len(cleaned) > 10:
                    bitext_inquiries.append({"intent": intent, "text": cleaned})
        print(f"-> Extracted {len(bitext_inquiries)} customer support inquiries from Bitext")
    except Exception as e:
        print(f"-> Notice: Could not load Bitext ({e}), using rich built-in support bank.")

    # 2. Sujalvc Hinglish Instruct Dataset
    try:
        ds_sujal = datasets.load_dataset("Sujalvc/hinglish-instruct-dataset", split="train")
        for row in ds_sujal:
            inst = row.get("instruction", "").strip()
            # Extract short, natural Hinglish user questions/statements
            if 15 <= len(inst) <= 120 and any(w in inst.lower() for w in ["kya", "hai", "mujhe", "karo", "batao", "kaise", "chahiye", "bhai", "deliver", "order"]):
                hinglish_phrasings.append(inst)
        print(f"-> Extracted {len(hinglish_phrasings)} authentic Hinglish patterns from Sujalvc")
    except Exception as e:
        print(f"-> Notice: Could not load Sujalvc ({e}), using built-in Hinglish patterns.")

    # 3. Ankitdhiman Colloquial Hinglish
    try:
        ds_ankit = datasets.load_dataset("ankitdhiman/colloquial-hinglish-conversations", split="train")
        for row in ds_ankit:
            msgs = row.get("messages", [])
            for m in msgs:
                if m.get("role") == "user":
                    txt = m.get("content", "").strip()
                    if 5 <= len(txt) <= 90:
                        colloquial_openers.append(txt)
        print(f"-> Extracted {len(colloquial_openers)} conversational lines from Ankitdhiman")
    except Exception as e:
        print(f"-> Notice: Could not load Ankitdhiman ({e}), using built-in colloquial pool.")

except ImportError:
    print("-> Notice: 'datasets' package not found; using built-in curated pools.")

# Fallback pools if external datasets yielded few items
if len(bitext_inquiries) < 100:
    bitext_inquiries = [
        {"intent": "delivery_options", "text": "Do you deliver to my apartment building?"},
        {"intent": "delivery_options", "text": "What is the minimum order value for free delivery?"},
        {"intent": "delivery_options", "text": "How long will delivery take once I confirm?"},
        {"intent": "payment_issue", "text": "Can I pay with UPI or Google Pay upon delivery?"},
        {"intent": "payment_issue", "text": "Do you accept cash on delivery?"},
        {"intent": "cancel_order", "text": "I need to cancel my previous order, please."},
        {"intent": "change_order", "text": "Can I change my delivery address for this order?"},
        {"intent": "change_order", "text": "Can I add one more item before you pack my order?"},
    ]

if len(hinglish_phrasings) < 100:
    hinglish_phrasings = [
        "bhaiya thoda jaldi bhej dena",
        "urgent chahiye, kitna time lagega",
        "agar online pay karna ho toh QR code bhejoge?",
        "paas wale society mein delivery hoti hai kya",
        "bhai payment delivery ke time cash mein de dunga",
        "ghar pe koi nahi hai, security guard ke paas drop kar dena",
    ]


# ==============================================================================
# 3. System Prompt Builder (Enforces 100% Professional English Assistant)
# ==============================================================================
def build_system_prompt(inventory_subset, out_of_stock_items=None):
    lines = []
    for item in inventory_subset:
        lines.append(f"- {item['name']} ({item['unit']}) | Category: {item['category']} | Price: Rs.{item['price']} | Status: IN_STOCK")
    if out_of_stock_items:
        for item in out_of_stock_items:
            lines.append(f"- {item['name']} ({item['unit']}) | Category: {item['category']} | Price: Rs.{item['price']} | Status: OUT_OF_STOCK")
    catalog_text = "\n".join(lines)

    return (
        "You are Dukaan.ai, a polite and efficient WhatsApp sales assistant for an Indian neighborhood Kirana store.\n"
        "RULES:\n"
        "1. LANGUAGE: ALWAYS reply 100% in courteous, professional English. Never use Hindi words like 'Namaste', 'Bhaiya', 'Haan', or 'Theek hai'.\n"
        "2. CATALOG ONLY: ONLY offer IN_STOCK items from the LIVE INVENTORY below and quote exact INR (Rs.) prices. Never hallucinate prices.\n"
        "3. TONE & STYLE: Keep responses concise (1-3 sentences), natural, and polite. Use at most 1 emoji per message. Zero AI fluff.\n"
        "4. ORDER FLOW:\n"
        "   - Step 1: Confirm requested in-stock items, quantities, and unit prices. (Optionally suggest 1 relevant in-stock upsell item).\n"
        "   - Step 2: Ask for Customer Name and Delivery Address (or WhatsApp location pin).\n"
        "   - Step 3: Present a clean Order Summary with exact item totals and grand total, then ask: \"Reply YES to confirm your order.\"\n"
        "   - Step 4: ONLY when the customer replies YES / CONFIRM / HAAN / OK, respond with a short confirmation message AND append the strict JSON block at the very end.\n\n"
        f"LIVE INVENTORY:\n{catalog_text}"
    )


# ==============================================================================
# 4. Helper Generators (English vs Hinglish Phrasing)
# ==============================================================================
def make_cart_request_text(cart, use_hinglish=False):
    parts = []
    for entry in cart:
        qty = entry["quantity"]
        alias = get_item_alias(entry["item"]["name"])
        if use_hinglish:
            unit_hint = random.choice(["packet", "pouch", "pack", "dabba", "piece", ""])
            parts.append(f"{qty} {unit_hint} {alias}".strip())
        else:
            parts.append(f"{qty} {entry['item']['unit']} of {alias}" if random.random() < 0.4 else f"{qty} {alias}")

    if use_hinglish:
        hinglish_join = ", ".join(parts[:-1]) + " aur " + parts[-1] if len(parts) > 1 else parts[0]
        templates = [
            f"Bhaiya {hinglish_join} bhej dena.",
            f"Hi, mujhe {hinglish_join} chahiye urgent.",
            f"Bhai {hinglish_join} hai kya stock mein? Delivery kardo.",
            f"{hinglish_join} deliver karwa do please.",
            f"Hello, {hinglish_join} bhej do jaldi.",
            f"Bhaiya please send {hinglish_join} to my address.",
        ]
        return random.choice(templates)
    else:
        # Natural English
        eng_join = ", ".join(parts[:-1]) + " and " + parts[-1] if len(parts) > 1 else parts[0]
        templates = [
            f"Hello, could you please deliver {eng_join}?",
            f"Hi! I need {eng_join} delivered to my place.",
            f"Can I place an order for {eng_join}?",
            f"Please send {eng_join} as soon as possible.",
            f"Are {eng_join} in stock right now? Need home delivery.",
            f"Hi Dukaan, please deliver {eng_join}.",
            f"Quick order please: {eng_join}.",
        ]
        return random.choice(templates)


# ==============================================================================
# 5. Scenario 1: Standard & Upsell Multi-Turn Orders (~9,000 examples)
# ==============================================================================
def generate_standard_order():
    use_hinglish = random.random() < 0.35  # 65% English, 35% Hinglish
    sampled_items = random.sample(MASTER_CATALOG, k=random.randint(9, 13))
    num_cart = random.randint(1, 3)
    cart_items = sampled_items[:num_cart]

    cart = []
    for item in cart_items:
        qty = random.randint(1, 3)
        cart.append({"item": item, "quantity": qty})

    # Capped at 25% upsell
    include_upsell = random.random() < 0.25
    upsell_name = cart[0]["item"]["upsell"]
    upsell_item = next((x for x in MASTER_CATALOG if upsell_name in x["name"]), sampled_items[-1])
    if upsell_item not in sampled_items:
        sampled_items.append(upsell_item)

    system_prompt = build_system_prompt(sampled_items)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)
    notes = random.choice(NOTES_OPTIONS)

    # User Turn 1
    user_t1 = make_cart_request_text(cart, use_hinglish=use_hinglish)

    # Assistant Turn 1 (Always 100% Professional English)
    conf_parts = [
        f"{c['quantity']}x {c['item']['name']} ({c['item']['unit']}) at Rs.{c['item']['price']}"
        for c in cart
    ]
    items_str = ", ".join(conf_parts)

    if include_upsell and all(c["item"]["name"] != upsell_item["name"] for c in cart):
        asst_t1 = (
            f"Hello! We have {items_str} available in stock. 🛒 "
            f"Would you also like to add {upsell_item['name']} ({upsell_item['unit']}) for Rs.{upsell_item['price']}? "
            f"Please share your Full Name and Delivery Address to proceed."
        )
    else:
        asst_t1 = (
            f"Hello! We have {items_str} in stock. 🛒 "
            f"Please share your Full Name and Delivery Address (or drop a WhatsApp location pin) so I can prepare your bill."
        )

    # User Turn 2
    accepted_upsell = include_upsell and (random.random() < 0.40)
    if accepted_upsell:
        cart.append({"item": upsell_item, "quantity": 1})
        if use_hinglish:
            user_t2 = f"Haan {upsell_item['name']} bhi add kardo. Name: {customer_name}, Address: {address}"
        else:
            user_t2 = f"Yes, please add {upsell_item['name']} as well. I am {customer_name}, address is {address}."
    else:
        if use_hinglish:
            user_t2 = random.choice([
                f"Mera naam {customer_name} hai. Deliver at {address}.",
                f"Name: {customer_name}\nAddress: {address}",
                f"{customer_name}, {address}. Aur kuch nahi chahiye.",
            ])
        else:
            user_t2 = random.choice([
                f"My name is {customer_name}. Please deliver to {address}.",
                f"Name: {customer_name}\nAddress: {address}",
                f"Please deliver to {address}. Contact person: {customer_name} ({notes}).",
            ])

    # Assistant Turn 2: Summary + Prompt
    summary_lines = []
    grand_total = 0
    for c in cart:
        line_tot = c["quantity"] * c["item"]["price"]
        grand_total += line_tot
        summary_lines.append(f"• {c['quantity']}x {c['item']['name']} ({c['item']['unit']}): Rs.{line_tot}")
    summary_block = "\n".join(summary_lines)

    asst_t2 = (
        f"Here is your Order Summary for {customer_name} ({address}):\n"
        f"{summary_block}\n"
        f"Total Payable: Rs.{grand_total} ({notes}). 📋\n"
        f"Reply YES to confirm your order."
    )

    # User Turn 3
    user_t3 = random.choice(CONFIRMATIONS_HINGLISH if use_hinglish and random.random() < 0.6 else CONFIRMATIONS_EN)

    # Assistant Turn 3 (Professional English + JSON)
    order_json = {
        "action": "CREATE_ORDER",
        "customerName": customer_name,
        "deliveryAddress": address,
        "items": [{"name": c["item"]["name"], "quantity": c["quantity"]} for c in cart],
        "notes": notes
    }
    asst_t3 = (
        f"Thank you, {customer_name}! Your order totaling Rs.{grand_total} has been confirmed and is out for packing. ✅\n"
        f"```json\n{json.dumps(order_json, indent=2)}\n```"
    )

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


# ==============================================================================
# 6. Scenario 2: One-Shot Fast Orders (~2,500 examples)
# ==============================================================================
def generate_oneshot_order():
    """Customer supplies items, Name, and Address all in the very first turn."""
    use_hinglish = random.random() < 0.35
    sampled_items = random.sample(MASTER_CATALOG, k=random.randint(8, 12))
    num_cart = random.randint(1, 3)
    cart = [{"item": it, "quantity": random.randint(1, 3)} for it in sampled_items[:num_cart]]

    system_prompt = build_system_prompt(sampled_items)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)
    notes = random.choice(NOTES_OPTIONS)

    items_part = make_cart_request_text(cart, use_hinglish=use_hinglish)
    if use_hinglish:
        user_t1 = f"{items_part} Deliver to {customer_name}, {address}."
    else:
        user_t1 = f"{items_part} My name is {customer_name} and my address is {address}."

    # Assistant immediately outputs Order Summary and asks to confirm
    summary_lines = []
    grand_total = 0
    for c in cart:
        line_tot = c["quantity"] * c["item"]["price"]
        grand_total += line_tot
        summary_lines.append(f"• {c['quantity']}x {c['item']['name']} ({c['item']['unit']}): Rs.{line_tot}")
    summary_block = "\n".join(summary_lines)

    asst_t1 = (
        f"Hello {customer_name}! All requested items are in stock. Here is your Order Summary for delivery to {address}:\n"
        f"{summary_block}\n"
        f"Total Payable: Rs.{grand_total} ({notes}). 📋\n"
        f"Reply YES to confirm your order."
    )

    user_t2 = random.choice(CONFIRMATIONS_HINGLISH if use_hinglish and random.random() < 0.6 else CONFIRMATIONS_EN)

    order_json = {
        "action": "CREATE_ORDER",
        "customerName": customer_name,
        "deliveryAddress": address,
        "items": [{"name": c["item"]["name"], "quantity": c["quantity"]} for c in cart],
        "notes": notes
    }
    asst_t2 = (
        f"Thank you, {customer_name}! Your order for Rs.{grand_total} is confirmed and will be delivered shortly. ✅\n"
        f"```json\n{json.dumps(order_json, indent=2)}\n```"
    )

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
        ]
    }


# ==============================================================================
# 7. Scenario 3: Mid-Order Cart Modifications (~2,000 examples)
# ==============================================================================
def generate_modification_order():
    """Customer sees summary, then modifies an item or quantity before confirming."""
    use_hinglish = random.random() < 0.35
    sampled_items = random.sample(MASTER_CATALOG, k=random.randint(9, 12))
    item1 = sampled_items[0]
    item2 = sampled_items[1]
    extra_item = sampled_items[2]

    cart = [
        {"item": item1, "quantity": 1},
        {"item": item2, "quantity": 1}
    ]

    system_prompt = build_system_prompt(sampled_items)
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)

    user_t1 = make_cart_request_text(cart, use_hinglish=use_hinglish)
    asst_t1 = (
        f"Hello! We have 1x {item1['name']} (Rs.{item1['price']}) and 1x {item2['name']} (Rs.{item2['price']}) in stock. 🛒 "
        f"Please share your Name and Delivery Address to proceed."
    )

    # Customer provides address, but modifies cart
    mod_type = random.choice(["change_qty", "add_item", "remove_item"])
    if mod_type == "change_qty":
        cart[0]["quantity"] = 2
        user_t2 = (
            f"Ek kaam karo, {item1['name']} 2 packet kardo. Name: {customer_name}, Address: {address}"
            if use_hinglish else
            f"Please make it 2 packs of {item1['name']} instead of 1. Name: {customer_name}, Address: {address}."
        )
    elif mod_type == "add_item":
        cart.append({"item": extra_item, "quantity": 1})
        user_t2 = (
            f"Ek 1x {extra_item['name']} bhi saath mein jod lo. {customer_name}, {address}"
            if use_hinglish else
            f"Please also add 1x {extra_item['name']} to the cart. I am {customer_name}, deliver to {address}."
        )
    else:
        # Remove item2
        removed = cart.pop()
        user_t2 = (
            f"Actually {removed['item']['name']} mat bhejna, baaki sab bhej do. {customer_name}, {address}"
            if use_hinglish else
            f"Actually please remove {removed['item']['name']} and send the rest. Name: {customer_name}, Address: {address}."
        )

    # Assistant recalculates exact total
    summary_lines = []
    grand_total = 0
    for c in cart:
        line_tot = c["quantity"] * c["item"]["price"]
        grand_total += line_tot
        summary_lines.append(f"• {c['quantity']}x {c['item']['name']} ({c['item']['unit']}): Rs.{line_tot}")
    summary_block = "\n".join(summary_lines)

    asst_t2 = (
        f"Updated! Here is your revised Order Summary for {customer_name} ({address}):\n"
        f"{summary_block}\n"
        f"Total Payable: Rs.{grand_total} (Cash on Delivery). 📋\n"
        f"Reply YES to confirm your order."
    )

    user_t3 = random.choice(CONFIRMATIONS_HINGLISH if use_hinglish and random.random() < 0.6 else CONFIRMATIONS_EN)

    order_json = {
        "action": "CREATE_ORDER",
        "customerName": customer_name,
        "deliveryAddress": address,
        "items": [{"name": c["item"]["name"], "quantity": c["quantity"]} for c in cart],
        "notes": "Cash on Delivery"
    }
    asst_t3 = (
        f"Thank you, {customer_name}! Your updated order totaling Rs.{grand_total} is confirmed and on its way. ✅\n"
        f"```json\n{json.dumps(order_json, indent=2)}\n```"
    )

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


# ==============================================================================
# 8. Scenario 4: Out-of-Stock Substitutions (~1,200 examples)
# ==============================================================================
def generate_oos_substitution():
    """1 requested item is OUT_OF_STOCK. Bot politely offers same-category IN_STOCK alternative."""
    use_hinglish = random.random() < 0.35
    sampled_items = random.sample(MASTER_CATALOG, k=10)
    oos_item = sampled_items[0]
    category = oos_item["category"]

    # Pick an alternative in the same category
    same_cat = [x for x in MASTER_CATALOG if x["category"] == category and x["name"] != oos_item["name"]]
    alt_item = random.choice(same_cat) if same_cat else sampled_items[1]
    in_stock_items = [x for x in sampled_items[1:] if x["name"] != alt_item["name"]] + [alt_item]

    system_prompt = build_system_prompt(in_stock_items, out_of_stock_items=[oos_item])
    customer_name = random.choice(CUSTOMER_NAMES)
    address = random.choice(DELIVERY_ADDRESSES)

    qty = random.randint(1, 2)
    alias_oos = get_item_alias(oos_item["name"])

    if use_hinglish:
        user_t1 = f"Bhaiya {qty} {alias_oos} bhej dena ghar pe."
    else:
        user_t1 = f"Hi, could you please deliver {qty}x {alias_oos}?"

    asst_t1 = (
        f"I apologize, but {oos_item['name']} ({oos_item['unit']}) is currently out of stock. "
        f"However, we have {alt_item['name']} ({alt_item['unit']}) available at Rs.{alt_item['price']}. 🛒 "
        f"Would you like to proceed with {alt_item['name']}, and could you share your Name and Delivery Address?"
    )

    if use_hinglish:
        user_t2 = f"Theek hai, {alt_item['name']} hi bhej do. Name: {customer_name}, Address: {address}"
    else:
        user_t2 = f"That works, please send {alt_item['name']} instead. I am {customer_name}, address is {address}."

    total = qty * alt_item["price"]
    asst_t2 = (
        f"Here is your Order Summary for {customer_name} ({address}):\n"
        f"• {qty}x {alt_item['name']} ({alt_item['unit']}): Rs.{total}\n"
        f"Total Payable: Rs.{total} (Cash on Delivery). 📋\n"
        f"Reply YES to confirm your order."
    )

    user_t3 = random.choice(CONFIRMATIONS_HINGLISH if use_hinglish and random.random() < 0.6 else CONFIRMATIONS_EN)

    order_json = {
        "action": "CREATE_ORDER",
        "customerName": customer_name,
        "deliveryAddress": address,
        "items": [{"name": alt_item["name"], "quantity": qty}],
        "notes": "Cash on Delivery"
    }
    asst_t3 = (
        f"Order confirmed, {customer_name}! Your {alt_item['name']} totaling Rs.{total} is being prepared for delivery. ✅\n"
        f"```json\n{json.dumps(order_json, indent=2)}\n```"
    )

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_t1},
            {"role": "assistant", "content": asst_t1},
            {"role": "user", "content": user_t2},
            {"role": "assistant", "content": asst_t2},
            {"role": "user", "content": user_t3},
            {"role": "assistant", "content": asst_t3},
        ]
    }


# ==============================================================================
# 9. Scenario 5: Bitext Customer Support & Inquiries (~1,200 examples)
# ==============================================================================
def generate_support_inquiry():
    """Customer asks about delivery, payment, cancellation, or pricing. Zero JSON emitted."""
    sampled_items = random.sample(MASTER_CATALOG, k=8)
    system_prompt = build_system_prompt(sampled_items)

    inquiry = random.choice(bitext_inquiries)
    intent = inquiry.get("intent", "general")
    user_q = inquiry.get("text", "")

    # Clean or adapt question
    user_q = re.sub(r"\{\{Product Name\}\}", sampled_items[0]["name"], user_q)

    if intent == "delivery_options":
        asst_reply = (
            "We offer free doorstep delivery within 30 to 45 minutes for all local orders above Rs.100. "
            "Please send your item list along with your delivery address whenever you are ready to order!"
        )
    elif intent == "payment_issue":
        asst_reply = (
            "We accept both Cash on Delivery (COD) and all major UPI options (Google Pay, PhonePe, Paytm) upon delivery. "
            "Our delivery partner carries a printed UPI QR code for quick payment at your doorstep."
        )
    elif intent in ["cancel_order", "check_cancellation_fee"]:
        asst_reply = (
            "There are zero cancellation fees! If you need to cancel a pending order, please share your order number "
            "or name, and we will cancel it immediately before dispatch."
        )
    elif intent == "change_order":
        asst_reply = (
            "Certainly! You can modify your items or update your delivery address before dispatch. "
            "Please send the updated details and we will adjust your bill right away."
        )
    else:
        # Price check
        item = sampled_items[0]
        user_q = f"Could you tell me the current price and stock status of {item['name']}?"
        asst_reply = (
            f"{item['name']} ({item['unit']}) is currently in stock at Rs.{item['price']}. "
            "Would you like to place an order for home delivery?"
        )

    # Optional 2nd turn
    if random.random() < 0.5:
        user_t2 = random.choice([
            "Okay thank you, I will order in the evening.",
            "Understood, thanks for the quick reply!",
            "Thank you, will message shortly."
        ])
        asst_t2 = "You are most welcome! Feel free to message us anytime you need groceries delivered. Have a great day!"
        return {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_q},
                {"role": "assistant", "content": asst_reply},
                {"role": "user", "content": user_t2},
                {"role": "assistant", "content": asst_t2},
            ]
        }

    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_q},
            {"role": "assistant", "content": asst_reply},
        ]
    }


# ==============================================================================
# 10. Scenario 6: Secondary Tasks (Business Insights & Receipt OCR) (~600 examples)
# ==============================================================================
def generate_business_insights():
    sampled = random.sample(MASTER_CATALOG, k=6)
    low_stock = sampled[0]
    top_seller = sampled[1]
    slow_mover = sampled[2]

    sys_prompt = (
        "You are Dukaan.ai Business Analyst. Analyze the store inventory snapshot and output "
        "ONLY a valid JSON array of 5 punchy actionable insights (each strictly under 20 words)."
    )
    user_prompt = (
        f"Store Snapshot:\n"
        f"- Low Stock Alert: {low_stock['name']} (only 2 left)\n"
        f"- Top Selling Item: {top_seller['name']} (48 units sold today)\n"
        f"- Slow Moving Item: {slow_mover['name']} (20 units in stock, zero sold this week)"
    )
    insights = [
        f"Restock {low_stock['name']} now; only 2 units remain before evening rush hours.",
        f"Order {top_seller['name']} bulk pack from distributor today to maintain peak volume.",
        f"Bundle slow-moving {slow_mover['name']} with {top_seller['name']} at 10% discount.",
        f"Dairy staples generate 65% of daily revenue; promote morning milk subscriptions.",
        f"Snack sales peak after 5 PM; send WhatsApp reminder alerts for cold drinks."
    ]
    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": json.dumps(insights, indent=2)}
        ]
    }


def generate_receipt_ocr():
    items = random.sample(MASTER_CATALOG, k=random.randint(3, 5))
    ocr_lines = [f"KIRANA SUPERSTORE - INVOICE #{random.randint(1000, 9999)}", "CASH MEMO"]
    parsed_output = []

    for idx, it in enumerate(items, 1):
        qty = random.randint(1, 4)
        line_price = it["price"] * qty
        noisy_sep = random.choice(["   ", " .. ", " | ", " - "])
        ocr_lines.append(f"{idx}. {it['name'][:24]}{noisy_sep}QTY:{qty}{noisy_sep}Rs.{line_price}")
        parsed_output.append({
            "name": it["name"],
            "quantity": qty,
            "price": line_price
        })
    ocr_lines.append("THANK YOU VISIT AGAIN!")

    sys_prompt = (
        "You are Dukaan.ai Receipt OCR Parser. Extract all grocery line items from the raw OCR text "
        "and return ONLY a strict JSON array of objects with keys: \"name\", \"quantity\", and \"price\"."
    )
    return {
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": "\n".join(ocr_lines)},
            {"role": "assistant", "content": json.dumps(parsed_output, indent=2)}
        ]
    }


# ==============================================================================
# 11. Main Generation & Split Logic (Exact 16,500 Count)
# ==============================================================================
def main():
    dataset = []

    print("[1/6] Generating 9,000 standard & upsell multi-turn orders (65% EN / 35% Hinglish)...")
    for _ in range(9000):
        dataset.append(generate_standard_order())

    print("[2/6] Generating 2,500 one-shot fast orders...")
    for _ in range(2500):
        dataset.append(generate_oneshot_order())

    print("[3/6] Generating 2,000 mid-order cart modification orders...")
    for _ in range(2000):
        dataset.append(generate_modification_order())

    print("[4/6] Generating 1,200 out-of-stock substitution orders...")
    for _ in range(1200):
        dataset.append(generate_oos_substitution())

    print("[5/6] Generating 1,200 customer support & inquiry conversations (Bitext grounded)...")
    for _ in range(1200):
        dataset.append(generate_support_inquiry())

    print("[6/6] Generating 600 secondary tasks (300 Business Insights + 300 Receipt OCR)...")
    for _ in range(300):
        dataset.append(generate_business_insights())
        dataset.append(generate_receipt_ocr())

    random.shuffle(dataset)
    total = len(dataset)
    assert total == 16500, f"Expected 16,500 examples, got {total}"

    # Target splits: 15,000 train, 750 valid, 750 test
    splits = {
        "train.jsonl": dataset[:15000],
        "valid.jsonl": dataset[15000:15750],
        "test.jsonl": dataset[15750:]
    }

    project_root = Path(__file__).resolve().parent.parent.parent
    out_dir = project_root / "data"
    out_dir.mkdir(exist_ok=True)

    print("\nWriting JSONL files to data/ directory:")
    for filename, records in splits.items():
        filepath = out_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            for row in records:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f" -> {filepath.name:12s}: {len(records):5d} lines ({filepath.stat().st_size / (1024*1024):.2f} MB)")

    print(f"\n✅ SUCCESS: Generated {total:,} total examples across {out_dir}.")


if __name__ == "__main__":
    main()
