import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_PATH = path.resolve(__dirname, '../whatsapp/store/catalog.json');

const items = [
  // ==========================================
  // 1. Staples & Grains (Atta, Rice, Dal, Oil, Ghee, Sugar, Salt)
  // ==========================================
  {
    name: "Aashirvaad Shudh Chakki Atta (5kg)",
    category: "Staples & Grains",
    price: 245,
    unit: "5kg bag",
    keywords: ["aashirvaad", "atta", "wheat flour", "chakki", "gehu ka atta", "5kg", "flour"]
  },
  {
    name: "Aashirvaad Shudh Chakki Atta (10kg)",
    category: "Staples & Grains",
    price: 475,
    unit: "10kg bag",
    keywords: ["aashirvaad", "atta", "wheat flour", "chakki", "gehu ka atta", "10kg", "flour"]
  },
  {
    name: "Fortune Chakki Fresh Atta (5kg)",
    category: "Staples & Grains",
    price: 230,
    unit: "5kg bag",
    keywords: ["fortune", "atta", "wheat flour", "chakki", "gehu ka atta", "5kg"]
  },
  {
    name: "Fortune Chakki Fresh Atta (10kg)",
    category: "Staples & Grains",
    price: 440,
    unit: "10kg bag",
    keywords: ["fortune", "atta", "wheat flour", "chakki", "gehu ka atta", "10kg"]
  },
  {
    name: "Pillsbury Chakki Fresh Atta (5kg)",
    category: "Staples & Grains",
    price: 240,
    unit: "5kg bag",
    keywords: ["pillsbury", "atta", "wheat flour", "chakki", "5kg"]
  },
  {
    name: "Rajdhani Maida (500g)",
    category: "Staples & Grains",
    price: 35,
    unit: "500g pack",
    keywords: ["rajdhani", "maida", "all purpose flour", "flour", "500g"]
  },
  {
    name: "Rajdhani Maida (1kg)",
    category: "Staples & Grains",
    price: 65,
    unit: "1kg pack",
    keywords: ["rajdhani", "maida", "all purpose flour", "flour", "1kg"]
  },
  {
    name: "Rajdhani Sooji / Rawa (500g)",
    category: "Staples & Grains",
    price: 38,
    unit: "500g pack",
    keywords: ["rajdhani", "sooji", "suji", "rawa", "semolina", "500g"]
  },
  {
    name: "Rajdhani Sooji / Rawa (1kg)",
    category: "Staples & Grains",
    price: 72,
    unit: "1kg pack",
    keywords: ["rajdhani", "sooji", "suji", "rawa", "semolina", "1kg"]
  },
  {
    name: "Fortune Besan (Gram Flour) (500g)",
    category: "Staples & Grains",
    price: 58,
    unit: "500g pack",
    keywords: ["fortune", "besan", "gram flour", "chana flour", "500g"]
  },
  {
    name: "Fortune Besan (Gram Flour) (1kg)",
    category: "Staples & Grains",
    price: 110,
    unit: "1kg pack",
    keywords: ["fortune", "besan", "gram flour", "chana flour", "1kg"]
  },
  {
    name: "Tata Sampann Besan (500g)",
    category: "Staples & Grains",
    price: 62,
    unit: "500g pack",
    keywords: ["tata", "sampann", "besan", "gram flour", "500g"]
  },
  {
    name: "Rajdhani Thick Poha (500g)",
    category: "Staples & Grains",
    price: 42,
    unit: "500g pack",
    keywords: ["rajdhani", "poha", "pohe", "flattened rice", "chivda", "500g"]
  },
  {
    name: "Tata Sampann Unpolished Toor Dal (Arhar) (1kg)",
    category: "Staples & Grains",
    price: 165,
    unit: "1kg pack",
    keywords: ["toor dal", "tuvar dal", "arhar dal", "tata sampann", "dal", "toor", "arhar", "1kg"]
  },
  {
    name: "Tata Sampann Unpolished Toor Dal (Arhar) (500g)",
    category: "Staples & Grains",
    price: 88,
    unit: "500g pack",
    keywords: ["toor dal", "tuvar dal", "arhar dal", "tata sampann", "dal", "toor", "arhar", "500g"]
  },
  {
    name: "Tata Sampann Moong Dal Split (1kg)",
    category: "Staples & Grains",
    price: 140,
    unit: "1kg pack",
    keywords: ["moong dal", "mung dal", "split moong", "tata sampann", "dal", "1kg"]
  },
  {
    name: "Tata Sampann Moong Dal Yellow (Dhuli) (1kg)",
    category: "Staples & Grains",
    price: 145,
    unit: "1kg pack",
    keywords: ["moong dhuli", "yellow moong", "mung dal", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Whole Green Moong (500g)",
    category: "Staples & Grains",
    price: 75,
    unit: "500g pack",
    keywords: ["sabut moong", "green moong", "whole moong", "sprouts", "500g"]
  },
  {
    name: "Tata Sampann Chana Dal (1kg)",
    category: "Staples & Grains",
    price: 115,
    unit: "1kg pack",
    keywords: ["chana dal", "bengal gram dal", "tata sampann", "dal", "1kg"]
  },
  {
    name: "Tata Sampann Masoor Dal (Malka) (1kg)",
    category: "Staples & Grains",
    price: 125,
    unit: "1kg pack",
    keywords: ["masoor dal", "malka masoor", "red lentil", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Urad Dal Split (Chilka) (1kg)",
    category: "Staples & Grains",
    price: 155,
    unit: "1kg pack",
    keywords: ["urad dal", "urad chilka", "black gram split", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Urad Dal White (Dhuli) (1kg)",
    category: "Staples & Grains",
    price: 160,
    unit: "1kg pack",
    keywords: ["urad dhuli", "white urad", "idli dal", "dosa dal", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Kabuli Chana (Chole) (1kg)",
    category: "Staples & Grains",
    price: 165,
    unit: "1kg pack",
    keywords: ["kabuli chana", "chole", "safed chana", "white chickpeas", "chana", "1kg"]
  },
  {
    name: "Tata Sampann Kala Chana (Brown Chickpeas) (1kg)",
    category: "Staples & Grains",
    price: 105,
    unit: "1kg pack",
    keywords: ["kala chana", "brown chana", "black chickpeas", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Rajma Red (Kidney Beans) (1kg)",
    category: "Staples & Grains",
    price: 175,
    unit: "1kg pack",
    keywords: ["rajma", "lal rajma", "red kidney beans", "chitra rajma", "tata sampann", "1kg"]
  },
  {
    name: "Tata Sampann Rajma Chitra (1kg)",
    category: "Staples & Grains",
    price: 185,
    unit: "1kg pack",
    keywords: ["rajma", "chitra rajma", "kidney beans", "tata sampann", "1kg"]
  },
  {
    name: "India Gate Basmati Rice Classic (5kg)",
    category: "Staples & Grains",
    price: 560,
    unit: "5kg bag",
    keywords: ["india gate", "basmati rice", "chawal", "classic basmati", "rice", "5kg"]
  },
  {
    name: "India Gate Basmati Rice Classic (1kg)",
    category: "Staples & Grains",
    price: 135,
    unit: "1kg pack",
    keywords: ["india gate", "basmati rice", "chawal", "classic basmati", "rice", "1kg"]
  },
  {
    name: "India Gate Basmati Rice Feast Rozzana (1kg)",
    category: "Staples & Grains",
    price: 95,
    unit: "1kg pack",
    keywords: ["india gate", "rozzana", "basmati rice", "daily rice", "chawal", "1kg"]
  },
  {
    name: "India Gate Basmati Rice Feast Rozzana (5kg)",
    category: "Staples & Grains",
    price: 440,
    unit: "5kg bag",
    keywords: ["india gate", "rozzana", "basmati rice", "daily rice", "chawal", "5kg"]
  },
  {
    name: "Daawat Rozana Gold Basmati Rice (1kg)",
    category: "Staples & Grains",
    price: 98,
    unit: "1kg pack",
    keywords: ["daawat", "rozana gold", "basmati rice", "chawal", "rice", "1kg"]
  },
  {
    name: "Daawat Rozana Gold Basmati Rice (5kg)",
    category: "Staples & Grains",
    price: 450,
    unit: "5kg bag",
    keywords: ["daawat", "rozana gold", "basmati rice", "chawal", "rice", "5kg"]
  },
  {
    name: "Fortune Everyday Basmati Rice (1kg)",
    category: "Staples & Grains",
    price: 85,
    unit: "1kg pack",
    keywords: ["fortune", "basmati rice", "everyday rice", "chawal", "1kg"]
  },
  {
    name: "Fortune Everyday Basmati Rice (5kg)",
    category: "Staples & Grains",
    price: 395,
    unit: "5kg bag",
    keywords: ["fortune", "basmati rice", "everyday rice", "chawal", "5kg"]
  },
  {
    name: "Kolam Raw Rice / Sona Masoori (5kg)",
    category: "Staples & Grains",
    price: 320,
    unit: "5kg bag",
    keywords: ["sona masoori", "kolam rice", "daily rice", "chawal", "5kg"]
  },
  {
    name: "Kolam Raw Rice / Sona Masoori (10kg)",
    category: "Staples & Grains",
    price: 610,
    unit: "10kg bag",
    keywords: ["sona masoori", "kolam rice", "daily rice", "chawal", "10kg"]
  },
  {
    name: "Fortune Sunlite Refined Sunflower Oil (1L)",
    category: "Staples & Grains",
    price: 145,
    unit: "1L pouch",
    keywords: ["fortune", "sunflower oil", "refined oil", "tel", "cooking oil", "1l"]
  },
  {
    name: "Fortune Sunlite Refined Sunflower Oil (5L)",
    category: "Staples & Grains",
    price: 690,
    unit: "5L can",
    keywords: ["fortune", "sunflower oil", "refined oil", "tel", "cooking oil", "5l"]
  },
  {
    name: "Saffola Gold Pro Healthy Lifestyle Oil (1L)",
    category: "Staples & Grains",
    price: 175,
    unit: "1L pouch",
    keywords: ["saffola", "saffola gold", "healthy oil", "blended oil", "tel", "1l"]
  },
  {
    name: "Saffola Gold Pro Healthy Lifestyle Oil (5L)",
    category: "Staples & Grains",
    price: 840,
    unit: "5L can",
    keywords: ["saffola", "saffola gold", "healthy oil", "blended oil", "tel", "5l"]
  },
  {
    name: "Fortune Kachi Ghani Pure Mustard Oil (1L)",
    category: "Staples & Grains",
    price: 155,
    unit: "1L bottle",
    keywords: ["fortune", "mustard oil", "kachi ghani", "sarson ka tel", "sarson tel", "1l"]
  },
  {
    name: "Fortune Kachi Ghani Pure Mustard Oil (5L)",
    category: "Staples & Grains",
    price: 740,
    unit: "5L can",
    keywords: ["fortune", "mustard oil", "kachi ghani", "sarson ka tel", "sarson tel", "5l"]
  },
  {
    name: "Dhara Kachi Ghani Mustard Oil (1L)",
    category: "Staples & Grains",
    price: 150,
    unit: "1L bottle",
    keywords: ["dhara", "mustard oil", "kachi ghani", "sarson ka tel", "1l"]
  },
  {
    name: "Gemini Refined Soybean Oil (1L)",
    category: "Staples & Grains",
    price: 130,
    unit: "1L pouch",
    keywords: ["gemini", "soybean oil", "soya oil", "refined oil", "tel", "1l"]
  },
  {
    name: "Fortune Soya Health Refined Soyabean Oil (1L)",
    category: "Staples & Grains",
    price: 132,
    unit: "1L pouch",
    keywords: ["fortune", "soyabean oil", "soya oil", "tel", "1l"]
  },
  {
    name: "Amul Pure Ghee (1L)",
    category: "Staples & Grains",
    price: 630,
    unit: "1L tin",
    keywords: ["amul ghee", "desi ghee", "pure ghee", "ghee", "amul", "1l"]
  },
  {
    name: "Amul Pure Ghee (500ml)",
    category: "Staples & Grains",
    price: 325,
    unit: "500ml pouch",
    keywords: ["amul ghee", "desi ghee", "pure ghee", "ghee", "amul", "500ml"]
  },
  {
    name: "Gowardhan Pure Cow Ghee (1L)",
    category: "Staples & Grains",
    price: 650,
    unit: "1L jar",
    keywords: ["gowardhan", "cow ghee", "desi ghee", "pure cow ghee", "ghee", "1l"]
  },
  {
    name: "Gowardhan Pure Cow Ghee (500ml)",
    category: "Staples & Grains",
    price: 335,
    unit: "500ml jar",
    keywords: ["gowardhan", "cow ghee", "desi ghee", "pure cow ghee", "ghee", "500ml"]
  },
  {
    name: "Mother Dairy Pure Ghee (1L)",
    category: "Staples & Grains",
    price: 620,
    unit: "1L carton",
    keywords: ["mother dairy", "desi ghee", "pure ghee", "ghee", "1l"]
  },
  {
    name: "Patanjali Cow Ghee (1L)",
    category: "Staples & Grains",
    price: 640,
    unit: "1L carton",
    keywords: ["patanjali", "cow ghee", "desi ghee", "ghee", "1l"]
  },
  {
    name: "Tata Salt Vacuum Evaporated (1kg)",
    category: "Staples & Grains",
    price: 28,
    unit: "1kg pack",
    keywords: ["tata salt", "salt", "namak", "desh ka namak", "iodized salt", "1kg"]
  },
  {
    name: "Tata Salt Lite Low Sodium (1kg)",
    category: "Staples & Grains",
    price: 45,
    unit: "1kg pack",
    keywords: ["tata salt lite", "low sodium salt", "salt", "namak", "1kg"]
  },
  {
    name: "Tata Rock Salt / Sendha Namak (1kg)",
    category: "Staples & Grains",
    price: 90,
    unit: "1kg pack",
    keywords: ["sendha namak", "rock salt", "vrat namak", "himalayan pink salt", "1kg"]
  },
  {
    name: "Catch Table Salt Sprinkler (200g)",
    category: "Staples & Grains",
    price: 35,
    unit: "200g sprinkler",
    keywords: ["catch salt", "sprinkler", "table salt", "namak", "200g"]
  },
  {
    name: "Dhampure Sulphurless Pure White Sugar (1kg)",
    category: "Staples & Grains",
    price: 52,
    unit: "1kg pack",
    keywords: ["sugar", "cheeni", "shakar", "dhampure", "white sugar", "1kg"]
  },
  {
    name: "Madhur Pure & Hygienic Sugar (1kg)",
    category: "Staples & Grains",
    price: 54,
    unit: "1kg pack",
    keywords: ["madhur", "sugar", "cheeni", "shakar", "hygienic sugar", "1kg"]
  },
  {
    name: "Madhur Pure & Hygienic Sugar (5kg)",
    category: "Staples & Grains",
    price: 260,
    unit: "5kg bag",
    keywords: ["madhur", "sugar", "cheeni", "shakar", "5kg"]
  },
  {
    name: "Organic Tattva Jaggery Powder (Gud) (500g)",
    category: "Staples & Grains",
    price: 65,
    unit: "500g pack",
    keywords: ["jaggery", "gud", "gur", "jaggery powder", "organic jaggery", "500g"]
  },
  {
    name: "Organic Tattva Jaggery Powder (Gud) (1kg)",
    category: "Staples & Grains",
    price: 120,
    unit: "1kg pack",
    keywords: ["jaggery", "gud", "gur", "jaggery powder", "organic jaggery", "1kg"]
  },

  // ==========================================
  // 2. Spices & Masalas
  // ==========================================
  {
    name: "Everest Turmeric Powder (Haldi) (100g)",
    category: "Spices & Masalas",
    price: 38,
    unit: "100g pack",
    keywords: ["everest", "haldi", "turmeric powder", "turmeric", "haldi powder", "100g"]
  },
  {
    name: "Everest Turmeric Powder (Haldi) (200g)",
    category: "Spices & Masalas",
    price: 72,
    unit: "200g pack",
    keywords: ["everest", "haldi", "turmeric powder", "turmeric", "haldi powder", "200g"]
  },
  {
    name: "Tata Sampann Turmeric Powder (Haldi) (200g)",
    category: "Spices & Masalas",
    price: 75,
    unit: "200g pack",
    keywords: ["tata sampann", "haldi", "turmeric", "turmeric powder", "200g"]
  },
  {
    name: "Everest Kashmiri Lal Chilli Powder (100g)",
    category: "Spices & Masalas",
    price: 85,
    unit: "100g pack",
    keywords: ["everest", "kashmiri mirch", "lal mirch", "red chilli powder", "mirchi powder", "100g"]
  },
  {
    name: "Everest Kashmiri Lal Chilli Powder (200g)",
    category: "Spices & Masalas",
    price: 165,
    unit: "200g pack",
    keywords: ["everest", "kashmiri mirch", "lal mirch", "red chilli powder", "mirchi powder", "200g"]
  },
  {
    name: "Everest Tikhalal Hot Chilli Powder (100g)",
    category: "Spices & Masalas",
    price: 55,
    unit: "100g pack",
    keywords: ["everest", "tikhalal", "teekha lal", "red chilli", "lal mirch", "mirchi", "100g"]
  },
  {
    name: "Tata Sampann Red Chilli Powder (Lal Mirch) (200g)",
    category: "Spices & Masalas",
    price: 98,
    unit: "200g pack",
    keywords: ["tata sampann", "red chilli", "lal mirch", "mirchi powder", "200g"]
  },
  {
    name: "Everest Coriander Powder (Dhania) (100g)",
    category: "Spices & Masalas",
    price: 42,
    unit: "100g pack",
    keywords: ["everest", "dhania", "coriander powder", "dhaniya", "dhania powder", "100g"]
  },
  {
    name: "Everest Coriander Powder (Dhania) (200g)",
    category: "Spices & Masalas",
    price: 80,
    unit: "200g pack",
    keywords: ["everest", "dhania", "coriander powder", "dhaniya", "dhania powder", "200g"]
  },
  {
    name: "Tata Sampann Coriander Powder (Dhania) (200g)",
    category: "Spices & Masalas",
    price: 84,
    unit: "200g pack",
    keywords: ["tata sampann", "dhania", "coriander powder", "dhaniya", "200g"]
  },
  {
    name: "MDH Garam Masala (100g)",
    category: "Spices & Masalas",
    price: 94,
    unit: "100g box",
    keywords: ["mdh", "garam masala", "garam masla", "khada masala", "100g"]
  },
  {
    name: "Everest Garam Masala (100g)",
    category: "Spices & Masalas",
    price: 90,
    unit: "100g box",
    keywords: ["everest", "garam masala", "garam masla", "100g"]
  },
  {
    name: "MDH Chana Masala (100g)",
    category: "Spices & Masalas",
    price: 88,
    unit: "100g box",
    keywords: ["mdh", "chana masala", "chole masala", "100g"]
  },
  {
    name: "Everest Chhole Masala (100g)",
    category: "Spices & Masalas",
    price: 85,
    unit: "100g box",
    keywords: ["everest", "chole masala", "chhole masala", "100g"]
  },
  {
    name: "MDH Pav Bhaji Masala (100g)",
    category: "Spices & Masalas",
    price: 88,
    unit: "100g box",
    keywords: ["mdh", "pav bhaji masala", "bhaji masala", "100g"]
  },
  {
    name: "Everest Pav Bhaji Masala (100g)",
    category: "Spices & Masalas",
    price: 84,
    unit: "100g box",
    keywords: ["everest", "pav bhaji masala", "bhaji masala", "100g"]
  },
  {
    name: "MDH Chunky Chat Masala (100g)",
    category: "Spices & Masalas",
    price: 82,
    unit: "100g box",
    keywords: ["mdh", "chat masala", "chaat masala", "chunky chat", "100g"]
  },
  {
    name: "Catch Sprinklers Chat Masala (100g)",
    category: "Spices & Masalas",
    price: 78,
    unit: "100g sprinkler",
    keywords: ["catch", "chat masala", "chaat masala", "sprinkler", "100g"]
  },
  {
    name: "Catch Black Pepper Powder (Kali Mirch) (100g)",
    category: "Spices & Masalas",
    price: 125,
    unit: "100g sprinkler",
    keywords: ["catch", "black pepper", "kali mirch", "pepper powder", "100g"]
  },
  {
    name: "MDH Kitchen King Masala (100g)",
    category: "Spices & Masalas",
    price: 92,
    unit: "100g box",
    keywords: ["mdh", "kitchen king", "kitchen king masala", "sabji masala", "100g"]
  },
  {
    name: "Everest Kitchen King Masala (100g)",
    category: "Spices & Masalas",
    price: 90,
    unit: "100g box",
    keywords: ["everest", "kitchen king", "sabji masala", "100g"]
  },
  {
    name: "MDH Sambhar Masala (100g)",
    category: "Spices & Masalas",
    price: 85,
    unit: "100g box",
    keywords: ["mdh", "sambhar masala", "sambar masala", "100g"]
  },
  {
    name: "Everest Sambhar Masala (100g)",
    category: "Spices & Masalas",
    price: 82,
    unit: "100g box",
    keywords: ["everest", "sambhar masala", "sambar masala", "100g"]
  },
  {
    name: "Everest Kasuri Methi (50g)",
    category: "Spices & Masalas",
    price: 45,
    unit: "50g pack",
    keywords: ["everest", "kasuri methi", "kasoori methi", "fenugreek leaves", "50g"]
  },
  {
    name: "Catch Jeera Whole (Cumin Seeds) (100g)",
    category: "Spices & Masalas",
    price: 80,
    unit: "100g pack",
    keywords: ["jeera", "cumin seeds", "zeera", "catch jeera", "sabut jeera", "100g"]
  },
  {
    name: "Catch Rai / Mustard Seeds (Small) (100g)",
    category: "Spices & Masalas",
    price: 32,
    unit: "100g pack",
    keywords: ["rai", "mustard seeds", "sarson ke dane", "sarson dana", "100g"]
  },
  {
    name: "Catch Saunf (Fennel Seeds) (100g)",
    category: "Spices & Masalas",
    price: 55,
    unit: "100g pack",
    keywords: ["saunf", "fennel seeds", "variyali", "mukhwas", "100g"]
  },
  {
    name: "Catch Sabut Ajwain (Carom Seeds) (100g)",
    category: "Spices & Masalas",
    price: 58,
    unit: "100g pack",
    keywords: ["ajwain", "carom seeds", "ajwain dana", "100g"]
  },
  {
    name: "Catch Cloves Whole (Laung) (50g)",
    category: "Spices & Masalas",
    price: 85,
    unit: "50g pack",
    keywords: ["laung", "cloves", "lavang", "sabut laung", "50g"]
  },
  {
    name: "Catch Green Cardamom (Elaichi) (50g)",
    category: "Spices & Masalas",
    price: 195,
    unit: "50g pack",
    keywords: ["elaichi", "green cardamom", "chhoti elaichi", "50g"]
  },
  {
    name: "Catch Black Cardamom (Badi Elaichi) (50g)",
    category: "Spices & Masalas",
    price: 140,
    unit: "50g pack",
    keywords: ["badi elaichi", "moti elaichi", "black cardamom", "50g"]
  },
  {
    name: "Catch Cinnamon Sticks (Dalchini) (50g)",
    category: "Spices & Masalas",
    price: 65,
    unit: "50g pack",
    keywords: ["dalchini", "cinnamon", "cinnamon sticks", "50g"]
  },
  {
    name: "Catch Tej Patta (Bay Leaves) (50g)",
    category: "Spices & Masalas",
    price: 35,
    unit: "50g pack",
    keywords: ["tej patta", "bay leaves", "tejpatta", "50g"]
  },
  {
    name: "Catch Compounded Asafoetida (Hing) (50g)",
    category: "Spices & Masalas",
    price: 65,
    unit: "50g tub",
    keywords: ["hing", "asafoetida", "catch hing", "heeng", "50g"]
  },
  {
    name: "Everest Hingraj Powder (Hing) (50g)",
    category: "Spices & Masalas",
    price: 68,
    unit: "50g tub",
    keywords: ["everest hing", "hing", "heeng", "asafoetida", "50g"]
  },
  {
    name: "Everest Shahi Biryani Masala (50g)",
    category: "Spices & Masalas",
    price: 52,
    unit: "50g box",
    keywords: ["everest", "biryani masala", "shahi biryani", "50g"]
  },
  {
    name: "Everest Chicken Masala (100g)",
    category: "Spices & Masalas",
    price: 88,
    unit: "100g box",
    keywords: ["everest", "chicken masala", "meat masala", "100g"]
  },
  {
    name: "Everest Meat Masala (100g)",
    category: "Spices & Masalas",
    price: 90,
    unit: "100g box",
    keywords: ["everest", "meat masala", "mutton masala", "100g"]
  },
  {
    name: "Everest Chaat Masala (100g)",
    category: "Spices & Masalas",
    price: 75,
    unit: "100g box",
    keywords: ["everest", "chaat masala", "chat masala", "100g"]
  },
  {
    name: "Everest Amchur Powder (Dry Mango) (100g)",
    category: "Spices & Masalas",
    price: 65,
    unit: "100g pack",
    keywords: ["amchur", "aamchur", "dry mango powder", "everest amchur", "100g"]
  },

  // ==========================================
  // 3. Dairy & Refrigerated
  // ==========================================
  {
    name: "Amul Taaza Homogenised Toned Milk (500ml)",
    category: "Dairy",
    price: 27,
    unit: "500ml pouch",
    keywords: ["amul", "taaza", "milk", "doodh", "toned milk", "500ml", "amul taaza"]
  },
  {
    name: "Amul Taaza Toned Milk (1L)",
    category: "Dairy",
    price: 54,
    unit: "1L carton",
    keywords: ["amul", "taaza", "milk", "doodh", "toned milk", "1l"]
  },
  {
    name: "Amul Gold Full Cream Milk (500ml)",
    category: "Dairy",
    price: 33,
    unit: "500ml pouch",
    keywords: ["amul gold", "gold milk", "full cream milk", "doodh", "amul", "500ml"]
  },
  {
    name: "Amul Gold Full Cream Milk (1L)",
    category: "Dairy",
    price: 66,
    unit: "1L pouch",
    keywords: ["amul gold", "gold milk", "full cream milk", "doodh", "amul", "1l"]
  },
  {
    name: "Amul Cow Fresh Milk (500ml)",
    category: "Dairy",
    price: 28,
    unit: "500ml pouch",
    keywords: ["amul cow milk", "cow milk", "gai ka doodh", "amul", "500ml"]
  },
  {
    name: "Mother Dairy Toned Milk (500ml)",
    category: "Dairy",
    price: 27,
    unit: "500ml pouch",
    keywords: ["mother dairy", "toned milk", "milk", "doodh", "500ml"]
  },
  {
    name: "Mother Dairy Full Cream Milk (1L)",
    category: "Dairy",
    price: 66,
    unit: "1L pouch",
    keywords: ["mother dairy", "full cream milk", "milk", "doodh", "1l"]
  },
  {
    name: "Mother Dairy Cow Milk (500ml)",
    category: "Dairy",
    price: 28,
    unit: "500ml pouch",
    keywords: ["mother dairy", "cow milk", "gai ka doodh", "500ml"]
  },
  {
    name: "Amul Masti Dahi (200g)",
    category: "Dairy",
    price: 20,
    unit: "200g cup",
    keywords: ["amul", "masti dahi", "dahi", "curd", "yogurt", "200g"]
  },
  {
    name: "Amul Masti Dahi (400g)",
    category: "Dairy",
    price: 35,
    unit: "400g cup",
    keywords: ["amul", "masti dahi", "dahi", "curd", "yogurt", "400g"]
  },
  {
    name: "Mother Dairy Classic Dahi (400g)",
    category: "Dairy",
    price: 35,
    unit: "400g tub",
    keywords: ["mother dairy", "dahi", "curd", "classic dahi", "400g"]
  },
  {
    name: "Nestle A+ Nourish Dahi (400g)",
    category: "Dairy",
    price: 45,
    unit: "400g tub",
    keywords: ["nestle", "nestle dahi", "a+ dahi", "curd", "400g"]
  },
  {
    name: "Amul Salted Butter (100g)",
    category: "Dairy",
    price: 58,
    unit: "100g pack",
    keywords: ["amul butter", "butter", "makhan", "salted butter", "100g"]
  },
  {
    name: "Amul Salted Butter (500g)",
    category: "Dairy",
    price: 275,
    unit: "500g pack",
    keywords: ["amul butter", "butter", "makhan", "salted butter", "500g"]
  },
  {
    name: "Amul Unsalted Butter (Cooking Butter) (500g)",
    category: "Dairy",
    price: 285,
    unit: "500g pack",
    keywords: ["amul", "unsalted butter", "white butter", "safed makhan", "500g"]
  },
  {
    name: "Mother Dairy Table Butter (100g)",
    category: "Dairy",
    price: 56,
    unit: "100g pack",
    keywords: ["mother dairy", "butter", "makhan", "table butter", "100g"]
  },
  {
    name: "Mother Dairy Table Butter (500g)",
    category: "Dairy",
    price: 270,
    unit: "500g pack",
    keywords: ["mother dairy", "butter", "makhan", "500g"]
  },
  {
    name: "Mother Dairy Fresh Paneer (200g)",
    category: "Dairy",
    price: 90,
    unit: "200g pack",
    keywords: ["mother dairy", "paneer", "fresh paneer", "cottage cheese", "200g"]
  },
  {
    name: "Amul Fresh Malai Paneer (200g)",
    category: "Dairy",
    price: 95,
    unit: "200g pack",
    keywords: ["amul paneer", "malai paneer", "fresh paneer", "paneer", "200g"]
  },
  {
    name: "Amul Cheese Slices (10 Slices - 200g)",
    category: "Dairy",
    price: 140,
    unit: "200g pack",
    keywords: ["amul cheese", "cheese slices", "cheese", "10 slices", "200g"]
  },
  {
    name: "Amul Processed Cheese Block (200g)",
    category: "Dairy",
    price: 130,
    unit: "200g pack",
    keywords: ["amul cheese", "cheese block", "processed cheese", "cheese", "200g"]
  },
  {
    name: "Amul Cheese Cubes (200g)",
    category: "Dairy",
    price: 135,
    unit: "200g box",
    keywords: ["amul cheese", "cheese cubes", "cubes", "cheese", "200g"]
  },
  {
    name: "Amul Fresh Cream (250ml)",
    category: "Dairy",
    price: 65,
    unit: "250ml tetra",
    keywords: ["amul fresh cream", "fresh cream", "malai", "cream", "250ml"]
  },
  {
    name: "Amul Masti Spiced Buttermilk / Chaas (200ml)",
    category: "Dairy",
    price: 15,
    unit: "200ml tetra",
    keywords: ["amul chaas", "buttermilk", "chaas", "chhaas", "masti buttermilk", "200ml"]
  },
  {
    name: "Amul Prolife Probiotic Lassi (200ml)",
    category: "Dairy",
    price: 20,
    unit: "200ml tetra",
    keywords: ["amul lassi", "lassi", "sweet lassi", "200ml"]
  },
  {
    name: "Amul Kool Mango Milk Shake (200ml)",
    category: "Dairy",
    price: 25,
    unit: "200ml can",
    keywords: ["amul kool", "milk shake", "mango shake", "amul", "200ml"]
  },
  {
    name: "Amul Kool Elaichi Flavoured Milk (200ml)",
    category: "Dairy",
    price: 25,
    unit: "200ml can",
    keywords: ["amul kool", "elaichi milk", "flavoured milk", "200ml"]
  },
  {
    name: "Farm Fresh White Eggs (Pack of 6)",
    category: "Dairy",
    price: 45,
    unit: "pack of 6",
    keywords: ["eggs", "ande", "anda", "white eggs", "poultry eggs", "6 eggs", "pack of 6"]
  },
  {
    name: "Farm Fresh White Eggs (Pack of 12)",
    category: "Dairy",
    price: 88,
    unit: "pack of 12",
    keywords: ["eggs", "ande", "anda", "white eggs", "12 eggs", "pack of 12"]
  },
  {
    name: "Farm Fresh White Eggs (Tray of 30)",
    category: "Dairy",
    price: 210,
    unit: "tray of 30",
    keywords: ["eggs", "ande", "anda", "egg tray", "30 eggs", "tray of 30"]
  },

  // ==========================================
  // 4. Bakery & Breakfast
  // ==========================================
  {
    name: "Britannia 100% Whole Wheat Bread (400g)",
    category: "Bakery & Breakfast",
    price: 50,
    unit: "400g loaf",
    keywords: ["britannia", "wheat bread", "brown bread", "bread", "atta bread", "400g"]
  },
  {
    name: "Harvest Gold White Regular Bread (400g)",
    category: "Bakery & Breakfast",
    price: 45,
    unit: "400g loaf",
    keywords: ["harvest gold", "white bread", "regular bread", "bread", "sandwich bread", "400g"]
  },
  {
    name: "English Oven Brown Bread (400g)",
    category: "Bakery & Breakfast",
    price: 55,
    unit: "400g loaf",
    keywords: ["english oven", "brown bread", "bread", "wheat bread", "400g"]
  },
  {
    name: "Britannia Milk Sweet Bread (400g)",
    category: "Bakery & Breakfast",
    price: 48,
    unit: "400g loaf",
    keywords: ["britannia", "milk bread", "sweet bread", "bread", "400g"]
  },
  {
    name: "Bonn Fresh Burger Buns (Pack of 4)",
    category: "Bakery & Breakfast",
    price: 35,
    unit: "pack of 4",
    keywords: ["burger buns", "bun", "burger bun", "bonn", "pack of 4"]
  },
  {
    name: "Bonn Soft Pav Buns (Pack of 6)",
    category: "Bakery & Breakfast",
    price: 30,
    unit: "pack of 6",
    keywords: ["pav", "ladi pav", "pav buns", "vada pav", "pav bhaji pav", "pack of 6"]
  },
  {
    name: "Britannia Bake Toast Suji Rusk (300g)",
    category: "Bakery & Breakfast",
    price: 50,
    unit: "300g pack",
    keywords: ["britannia", "rusk", "suji rusk", "toast", "chai toast", "300g"]
  },
  {
    name: "Britannia Premium Bake Rusk (200g)",
    category: "Bakery & Breakfast",
    price: 35,
    unit: "200g pack",
    keywords: ["britannia", "rusk", "toast", "bake rusk", "200g"]
  },
  {
    name: "Kellogg's Corn Flakes Original (250g)",
    category: "Bakery & Breakfast",
    price: 99,
    unit: "250g box",
    keywords: ["kelloggs", "corn flakes", "breakfast cereal", "cereal", "250g"]
  },
  {
    name: "Kellogg's Corn Flakes Original (500g)",
    category: "Bakery & Breakfast",
    price: 195,
    unit: "500g box",
    keywords: ["kelloggs", "corn flakes", "cereal", "500g"]
  },
  {
    name: "Kellogg's Chocos Chocolate Cereal (250g)",
    category: "Bakery & Breakfast",
    price: 110,
    unit: "250g box",
    keywords: ["kelloggs", "chocos", "chocolate flakes", "cereal", "250g"]
  },
  {
    name: "Quaker Rolled Oats (1kg)",
    category: "Bakery & Breakfast",
    price: 190,
    unit: "1kg pack",
    keywords: ["quaker", "oats", "rolled oats", "healthy breakfast", "dalia", "1kg"]
  },
  {
    name: "Quaker Rolled Oats (500g)",
    category: "Bakery & Breakfast",
    price: 105,
    unit: "500g pack",
    keywords: ["quaker", "oats", "rolled oats", "500g"]
  },
  {
    name: "Saffola Masala Oats Classic Masala (400g)",
    category: "Bakery & Breakfast",
    price: 165,
    unit: "400g pouch",
    keywords: ["saffola", "masala oats", "classic masala", "oats", "400g"]
  },
  {
    name: "Kissan Mixed Fruit Jam (500g)",
    category: "Bakery & Breakfast",
    price: 160,
    unit: "500g bottle",
    keywords: ["kissan", "mixed fruit jam", "fruit jam", "jam", "kissan jam", "500g"]
  },
  {
    name: "Kissan Mixed Fruit Jam (200g)",
    category: "Bakery & Breakfast",
    price: 75,
    unit: "200g bottle",
    keywords: ["kissan", "jam", "mixed fruit", "200g"]
  },
  {
    name: "Pintola All Natural Peanut Butter Crunchy (350g)",
    category: "Bakery & Breakfast",
    price: 165,
    unit: "350g jar",
    keywords: ["pintola", "peanut butter", "crunchy peanut butter", "butter", "350g"]
  },
  {
    name: "Pintola All Natural Peanut Butter Creamy (350g)",
    category: "Bakery & Breakfast",
    price: 165,
    unit: "350g jar",
    keywords: ["pintola", "peanut butter", "creamy peanut butter", "butter", "350g"]
  },
  {
    name: "Britannia Fruity Fun Cake (150g)",
    category: "Bakery & Breakfast",
    price: 35,
    unit: "150g pack",
    keywords: ["britannia", "cake", "fruit cake", "fruity fun", "bar cake", "150g"]
  },

  // ==========================================
  // 5. Snacks, Biscuits & Namkeen
  // ==========================================
  {
    name: "Parle-G Original Gluco Biscuits (130g)",
    category: "Snacks & Biscuits",
    price: 10,
    unit: "pack (130g)",
    keywords: ["parle-g", "parleg", "parle g", "gluco", "biscuit", "chai biscuit", "130g", "chhota pack"]
  },
  {
    name: "Parle-G Original Gluco Biscuits (250g)",
    category: "Snacks & Biscuits",
    price: 25,
    unit: "pack (250g)",
    keywords: ["parle-g", "parleg", "parle g", "gluco", "biscuit", "250g"]
  },
  {
    name: "Parle-G Original Gluco Biscuits (800g)",
    category: "Snacks & Biscuits",
    price: 75,
    unit: "pack (800g)",
    keywords: ["parle-g", "parleg", "parle g", "family pack", "biscuit", "800g"]
  },
  {
    name: "Britannia Good Day Butter Cookies (100g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (100g)",
    keywords: ["good day", "goodday", "butter cookies", "biscuit", "cookies", "100g"]
  },
  {
    name: "Britannia Good Day Cashew Cookies (200g)",
    category: "Snacks & Biscuits",
    price: 40,
    unit: "pack (200g)",
    keywords: ["good day", "cashew cookies", "kaju biscuit", "goodday", "cookies", "200g"]
  },
  {
    name: "Britannia Marie Gold Biscuits (250g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (250g)",
    keywords: ["marie gold", "marie biscuit", "britannia marie", "tea biscuit", "250g"]
  },
  {
    name: "Britannia Marie Gold Biscuits (120g)",
    category: "Snacks & Biscuits",
    price: 15,
    unit: "pack (120g)",
    keywords: ["marie gold", "marie biscuit", "120g"]
  },
  {
    name: "Parle Monaco Salted Crackers (200g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (200g)",
    keywords: ["monaco", "salted biscuit", "crackers", "namkeen biscuit", "parle", "200g"]
  },
  {
    name: "Parle Monaco Salted Crackers (65g)",
    category: "Snacks & Biscuits",
    price: 10,
    unit: "pack (65g)",
    keywords: ["monaco", "salted biscuit", "crackers", "65g"]
  },
  {
    name: "Parle Krackjack Sweet & Salty Crackers (200g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (200g)",
    keywords: ["krackjack", "crackjack", "sweet and salty", "biscuit", "200g"]
  },
  {
    name: "Britannia 50-50 Maska Chaska Biscuits (120g)",
    category: "Snacks & Biscuits",
    price: 25,
    unit: "pack (120g)",
    keywords: ["50-50", "maska chaska", "britannia 50 50", "biscuit", "120g"]
  },
  {
    name: "Britannia Bourbon Chocolate Cream Biscuits (150g)",
    category: "Snacks & Biscuits",
    price: 30,
    unit: "pack (150g)",
    keywords: ["bourbon", "chocolate biscuit", "cream biscuit", "britannia", "150g"]
  },
  {
    name: "Parle Hide & Seek Chocolate Chip Cookies (120g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (120g)",
    keywords: ["hide and seek", "hide & seek", "choco chip", "cookies", "parle", "120g"]
  },
  {
    name: "Cadbury Oreo Original Vanilla Biscuits (120g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (120g)",
    keywords: ["oreo", "oreo biscuits", "vanilla cream", "cadbury", "120g"]
  },
  {
    name: "Sunfeast Dark Fantasy Choco Fills (300g)",
    category: "Snacks & Biscuits",
    price: 140,
    unit: "pack (300g)",
    keywords: ["dark fantasy", "choco fills", "sunfeast", "chocolate cookie", "300g"]
  },
  {
    name: "Sunfeast Dark Fantasy Choco Fills (75g)",
    category: "Snacks & Biscuits",
    price: 40,
    unit: "pack (75g)",
    keywords: ["dark fantasy", "choco fills", "sunfeast", "75g"]
  },
  {
    name: "Britannia Little Hearts Biscuits (75g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (75g)",
    keywords: ["little hearts", "sugar biscuits", "hearts", "britannia", "75g"]
  },
  {
    name: "Britannia Treat Jim Jam Cream Biscuits (138g)",
    category: "Snacks & Biscuits",
    price: 35,
    unit: "pack (138g)",
    keywords: ["jim jam", "treat jim jam", "jam biscuit", "cream biscuit", "138g"]
  },
  {
    name: "Britannia Milk Bikis Biscuits (100g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (100g)",
    keywords: ["milk bikis", "doodh biscuit", "britannia", "100g"]
  },
  {
    name: "Parle 20-20 Cashew Cookies (100g)",
    category: "Snacks & Biscuits",
    price: 15,
    unit: "pack (100g)",
    keywords: ["20-20", "twenty twenty", "cashew cookies", "parle", "100g"]
  },
  {
    name: "Haldiram's Aloo Bhujia (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["aloo bhujia", "haldiram aloo bhujia", "bhujia", "namkeen", "sev", "200g"]
  },
  {
    name: "Haldiram's Aloo Bhujia (400g)",
    category: "Snacks & Biscuits",
    price: 105,
    unit: "pack (400g)",
    keywords: ["aloo bhujia", "haldiram aloo bhujia", "bhujia", "namkeen", "400g"]
  },
  {
    name: "Haldiram's Bhujia Sev (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["bhujia sev", "haldiram sev", "besan sev", "namkeen", "200g"]
  },
  {
    name: "Haldiram's Khatta Meetha Mixture (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["khatta meetha", "haldiram mixture", "namkeen mixture", "khatta meetha mixture", "200g"]
  },
  {
    name: "Haldiram's Khatta Meetha Mixture (400g)",
    category: "Snacks & Biscuits",
    price: 105,
    unit: "pack (400g)",
    keywords: ["khatta meetha", "mixture", "namkeen", "400g"]
  },
  {
    name: "Haldiram's Punjabi Tadka (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["punjabi tadka", "haldiram", "namkeen", "spicy namkeen", "200g"]
  },
  {
    name: "Haldiram's Moong Dal Salted (200g)",
    category: "Snacks & Biscuits",
    price: 60,
    unit: "pack (200g)",
    keywords: ["moong dal namkeen", "haldiram moong dal", "salted dal", "200g"]
  },
  {
    name: "Haldiram's Navratan Mixture (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["navratan", "navratan mixture", "haldiram mixture", "namkeen", "200g"]
  },
  {
    name: "Haldiram's Chana Jor Garam (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["chana jor garam", "haldiram chana", "namkeen", "200g"]
  },
  {
    name: "Haldiram's Salted Peanuts (200g)",
    category: "Snacks & Biscuits",
    price: 55,
    unit: "pack (200g)",
    keywords: ["salted peanuts", "singdana", "mungfali", "haldiram peanuts", "200g"]
  },
  {
    name: "Lay's India's Magic Masala Chips (50g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (50g)",
    keywords: ["lays", "magic masala", "blue lays", "chips", "potato chips", "50g"]
  },
  {
    name: "Lay's Classic Salted Chips (50g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (50g)",
    keywords: ["lays", "classic salted", "yellow lays", "salted chips", "chips", "50g"]
  },
  {
    name: "Lay's Spanish Tomato Tango Chips (50g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (50g)",
    keywords: ["lays", "tomato tango", "red lays", "tomato chips", "chips", "50g"]
  },
  {
    name: "Lay's American Style Cream & Onion Chips (50g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (50g)",
    keywords: ["lays", "cream and onion", "green lays", "chips", "50g"]
  },
  {
    name: "Kurkure Masala Munch (90g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (90g)",
    keywords: ["kurkure", "masala munch", "namkeen", "tedhe medhe", "90g"]
  },
  {
    name: "Kurkure Chilli Chatka (90g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (90g)",
    keywords: ["kurkure", "chilli chatka", "spicy kurkure", "namkeen", "90g"]
  },
  {
    name: "Bingo Mad Angles Achaari Masti (66g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (66g)",
    keywords: ["bingo", "mad angles", "achaari masti", "triangle chips", "66g"]
  },
  {
    name: "Bingo Tedhe Medhe Masala Tadka (90g)",
    category: "Snacks & Biscuits",
    price: 20,
    unit: "pack (90g)",
    keywords: ["bingo", "tedhe medhe", "namkeen", "90g"]
  },
  {
    name: "Act II Butter Lovers Instant Popcorn (30g)",
    category: "Snacks & Biscuits",
    price: 15,
    unit: "pouch (30g)",
    keywords: ["act ii", "popcorn", "butter lovers", "instant popcorn", "makai", "30g"]
  },
  {
    name: "Act II Classic Salted Instant Popcorn (30g)",
    category: "Snacks & Biscuits",
    price: 15,
    unit: "pouch (30g)",
    keywords: ["act ii", "popcorn", "classic salted", "salted popcorn", "30g"]
  },
  {
    name: "Act II Golden Sizzle Microwave Popcorn (85g)",
    category: "Snacks & Biscuits",
    price: 60,
    unit: "pack (85g)",
    keywords: ["act ii", "microwave popcorn", "popcorn", "golden sizzle", "85g"]
  },

  // ==========================================
  // 6. Instant Foods & Noodles
  // ==========================================
  {
    name: "Maggi 2-Minute Masala Noodles (70g)",
    category: "Instant Food & Noodles",
    price: 14,
    unit: "pack (70g)",
    keywords: ["maggi", "maggie", "2-minute", "noodles", "masala noodles", "70g", "single pack"]
  },
  {
    name: "Maggi 2-Minute Masala Noodles (4-Pack - 280g)",
    category: "Instant Food & Noodles",
    price: 55,
    unit: "pack (280g)",
    keywords: ["maggi", "maggie", "4-pack", "4 pack maggi", "noodles", "280g"]
  },
  {
    name: "Maggi 2-Minute Masala Noodles (8-Pack - 560g)",
    category: "Instant Food & Noodles",
    price: 105,
    unit: "pack (560g)",
    keywords: ["maggi", "maggie", "8-pack", "8 pack maggi", "family pack", "560g"]
  },
  {
    name: "Maggi Nutri-Licious Atta Noodles (72.5g)",
    category: "Instant Food & Noodles",
    price: 25,
    unit: "pack (72.5g)",
    keywords: ["maggi", "atta noodles", "wheat noodles", "nutri-licious", "72.5g"]
  },
  {
    name: "Maggi Nutri-Licious Atta Noodles (4-Pack - 290g)",
    category: "Instant Food & Noodles",
    price: 98,
    unit: "pack (290g)",
    keywords: ["maggi", "atta noodles", "4-pack", "wheat noodles", "290g"]
  },
  {
    name: "Maggi Special Masala Noodles (70g)",
    category: "Instant Food & Noodles",
    price: 20,
    unit: "pack (70g)",
    keywords: ["maggi", "special masala", "spicy maggi", "noodles", "70g"]
  },
  {
    name: "Yippee Magic Masala Noodles (4-Pack - 240g)",
    category: "Instant Food & Noodles",
    price: 50,
    unit: "pack (240g)",
    keywords: ["yippee", "sunfeast yippee", "magic masala", "noodles", "240g"]
  },
  {
    name: "Yippee Magic Masala Noodles (70g)",
    category: "Instant Food & Noodles",
    price: 14,
    unit: "pack (70g)",
    keywords: ["yippee", "magic masala", "noodles", "70g"]
  },
  {
    name: "Top Ramen Curry Veg Noodles (280g - 4-Pack)",
    category: "Instant Food & Noodles",
    price: 52,
    unit: "pack (280g)",
    keywords: ["top ramen", "curry noodles", "veg noodles", "nissin", "280g"]
  },
  {
    name: "Ching's Secret Hakka Veg Noodles (150g)",
    category: "Instant Food & Noodles",
    price: 40,
    unit: "pack (150g)",
    keywords: ["chings", "hakka noodles", "veg noodles", "chowmein", "150g"]
  },
  {
    name: "Ching's Secret Schezwan Chutney (250g)",
    category: "Instant Food & Noodles",
    price: 85,
    unit: "250g jar",
    keywords: ["chings", "schezwan chutney", "schezwan sauce", "spicy sauce", "250g"]
  },
  {
    name: "Ching's Secret Dark Soy Sauce (200g)",
    category: "Instant Food & Noodles",
    price: 55,
    unit: "200g bottle",
    keywords: ["chings", "soy sauce", "soya sauce", "dark soy", "200g"]
  },
  {
    name: "Ching's Secret Green Chilli Sauce (200g)",
    category: "Instant Food & Noodles",
    price: 55,
    unit: "200g bottle",
    keywords: ["chings", "green chilli sauce", "chilli sauce", "200g"]
  },
  {
    name: "Ching's Secret Red Chilli Sauce (200g)",
    category: "Instant Food & Noodles",
    price: 55,
    unit: "200g bottle",
    keywords: ["chings", "red chilli sauce", "chilli sauce", "200g"]
  },
  {
    name: "Ching's Secret Chilli Vinegar (200g)",
    category: "Instant Food & Noodles",
    price: 50,
    unit: "200g bottle",
    keywords: ["chings", "vinegar", "sirka", "chilli vinegar", "200g"]
  },
  {
    name: "Kissan Fresh Tomato Ketchup (500g)",
    category: "Instant Food & Noodles",
    price: 110,
    unit: "500g bottle",
    keywords: ["kissan", "tomato ketchup", "ketchup", "sauce", "tamatar sauce", "500g"]
  },
  {
    name: "Kissan Fresh Tomato Ketchup (1kg)",
    category: "Instant Food & Noodles",
    price: 160,
    unit: "1kg pouch",
    keywords: ["kissan", "tomato ketchup", "ketchup", "sauce", "1kg refill", "1kg"]
  },
  {
    name: "Maggi Hot & Sweet Chilli Sauce (500g)",
    category: "Instant Food & Noodles",
    price: 125,
    unit: "500g bottle",
    keywords: ["maggi", "hot & sweet", "chilli sauce", "tomato chilli", "500g"]
  },
  {
    name: "Dr. Oetker Funfoods Veg Mayonnaise Original (250g)",
    category: "Instant Food & Noodles",
    price: 89,
    unit: "250g pouch",
    keywords: ["funfoods", "mayonnaise", "veg mayo", "mayo", "dr oetker", "250g"]
  },
  {
    name: "Dr. Oetker Funfoods Veg Mayonnaise Original (500g)",
    category: "Instant Food & Noodles",
    price: 155,
    unit: "500g jar",
    keywords: ["funfoods", "mayonnaise", "veg mayo", "mayo", "500g"]
  },
  {
    name: "Dr. Oetker Funfoods Pasta & Pizza Sauce (325g)",
    category: "Instant Food & Noodles",
    price: 99,
    unit: "325g bottle",
    keywords: ["funfoods", "pizza sauce", "pasta sauce", "pizza pasta sauce", "325g"]
  },
  {
    name: "Borges Penne Rigate Durum Wheat Pasta (500g)",
    category: "Instant Food & Noodles",
    price: 135,
    unit: "500g pack",
    keywords: ["pasta", "penne pasta", "borges pasta", "durum wheat", "500g"]
  },
  {
    name: "Borges Fusilli Durum Wheat Pasta (500g)",
    category: "Instant Food & Noodles",
    price: 135,
    unit: "500g pack",
    keywords: ["pasta", "fusilli pasta", "spiral pasta", "borges", "500g"]
  },
  {
    name: "Knorr Classic Sweet Corn Veg Soup (43g)",
    category: "Instant Food & Noodles",
    price: 40,
    unit: "43g pack",
    keywords: ["knorr", "sweet corn soup", "veg soup", "soup", "43g"]
  },
  {
    name: "Knorr Classic Thick Tomato Soup (53g)",
    category: "Instant Food & Noodles",
    price: 40,
    unit: "53g pack",
    keywords: ["knorr", "tomato soup", "thick tomato", "soup", "53g"]
  },
  {
    name: "Knorr Classic Mixed Veg Soup (43g)",
    category: "Instant Food & Noodles",
    price: 40,
    unit: "43g pack",
    keywords: ["knorr", "mixed veg soup", "veg soup", "soup", "43g"]
  },
  {
    name: "Lijjat Udad Moong Papad (200g)",
    category: "Instant Food & Noodles",
    price: 70,
    unit: "200g pack",
    keywords: ["lijjat papad", "udad papad", "moong papad", "papad", "200g"]
  },
  {
    name: "Lijjat Punjabi Masala Papad (200g)",
    category: "Instant Food & Noodles",
    price: 72,
    unit: "200g pack",
    keywords: ["lijjat papad", "punjabi masala", "masala papad", "papad", "200g"]
  },

  // ==========================================
  // 7. Beverages (Tea, Coffee, Health Drinks, Soft Drinks, Juices, Water)
  // ==========================================
  {
    name: "Tata Tea Gold (250g)",
    category: "Beverages",
    price: 150,
    unit: "250g pack",
    keywords: ["tata tea gold", "tata tea", "chai patti", "tea", "gold tea", "250g"]
  },
  {
    name: "Tata Tea Gold (500g)",
    category: "Beverages",
    price: 290,
    unit: "500g pack",
    keywords: ["tata tea gold", "tata tea", "chai patti", "tea", "500g"]
  },
  {
    name: "Tata Tea Gold (1kg)",
    category: "Beverages",
    price: 560,
    unit: "1kg pack",
    keywords: ["tata tea gold", "tata tea", "chai patti", "tea", "1kg"]
  },
  {
    name: "Red Label Natural Care Tea (250g)",
    category: "Beverages",
    price: 155,
    unit: "250g pack",
    keywords: ["red label", "natural care", "chai patti", "tea", "herbal tea", "250g"]
  },
  {
    name: "Red Label Natural Care Tea (500g)",
    category: "Beverages",
    price: 285,
    unit: "500g pack",
    keywords: ["red label", "natural care", "chai patti", "tea", "500g"]
  },
  {
    name: "Red Label Regular Tea (250g)",
    category: "Beverages",
    price: 125,
    unit: "250g pack",
    keywords: ["red label", "chai patti", "tea", "brooke bond", "250g"]
  },
  {
    name: "Red Label Regular Tea (500g)",
    category: "Beverages",
    price: 245,
    unit: "500g pack",
    keywords: ["red label", "chai patti", "tea", "brooke bond", "500g"]
  },
  {
    name: "Brooke Bond Taj Mahal Tea (250g)",
    category: "Beverages",
    price: 195,
    unit: "250g pack",
    keywords: ["taj mahal tea", "taj mahal", "chai patti", "premium tea", "250g"]
  },
  {
    name: "Brooke Bond Taj Mahal Tea (500g)",
    category: "Beverages",
    price: 380,
    unit: "500g pack",
    keywords: ["taj mahal tea", "taj mahal", "chai patti", "500g"]
  },
  {
    name: "Wagh Bakri Premium CTC Tea (500g)",
    category: "Beverages",
    price: 280,
    unit: "500g pack",
    keywords: ["wagh bakri", "wagh bakri tea", "ctc tea", "chai patti", "500g"]
  },
  {
    name: "Tata Tea Premium (Desh Ki Chai) (500g)",
    category: "Beverages",
    price: 260,
    unit: "500g pack",
    keywords: ["tata tea premium", "tata tea", "desh ki chai", "chai", "500g"]
  },
  {
    name: "Bru Instant Coffee (100g)",
    category: "Beverages",
    price: 215,
    unit: "100g jar",
    keywords: ["bru coffee", "bru instant", "coffee", "instant coffee", "bru", "100g"]
  },
  {
    name: "Bru Instant Coffee (200g)",
    category: "Beverages",
    price: 410,
    unit: "200g jar",
    keywords: ["bru coffee", "bru instant", "coffee", "200g"]
  },
  {
    name: "Bru Instant Coffee Pouch (50g)",
    category: "Beverages",
    price: 95,
    unit: "50g pouch",
    keywords: ["bru coffee", "bru instant", "coffee pouch", "50g"]
  },
  {
    name: "Nescafe Classic Instant Coffee (100g)",
    category: "Beverages",
    price: 235,
    unit: "100g jar",
    keywords: ["nescafe", "nescafe classic", "coffee", "instant coffee", "100g"]
  },
  {
    name: "Nescafe Classic Instant Coffee (50g)",
    category: "Beverages",
    price: 125,
    unit: "50g jar",
    keywords: ["nescafe", "nescafe classic", "coffee", "50g"]
  },
  {
    name: "Cadbury Bournvita Chocolate Health Drink (500g)",
    category: "Beverages",
    price: 245,
    unit: "500g jar",
    keywords: ["bournvita", "cadbury bournvita", "health drink", "chocolate drink", "500g"]
  },
  {
    name: "Cadbury Bournvita Chocolate Health Drink (1kg)",
    category: "Beverages",
    price: 470,
    unit: "1kg refill",
    keywords: ["bournvita", "cadbury bournvita", "health drink", "1kg"]
  },
  {
    name: "Horlicks Classic Malt Health Drink (500g)",
    category: "Beverages",
    price: 260,
    unit: "500g jar",
    keywords: ["horlicks", "classic malt", "malt drink", "health drink", "500g"]
  },
  {
    name: "Horlicks Classic Malt Health Drink (1kg)",
    category: "Beverages",
    price: 495,
    unit: "1kg refill",
    keywords: ["horlicks", "classic malt", "1kg"]
  },
  {
    name: "Boost Health Drink (500g)",
    category: "Beverages",
    price: 250,
    unit: "500g jar",
    keywords: ["boost", "boost is the secret", "energy drink", "health drink", "500g"]
  },
  {
    name: "Hamdard Rooh Afza Sharbat (750ml)",
    category: "Beverages",
    price: 170,
    unit: "750ml bottle",
    keywords: ["rooh afza", "hamdard", "rose syrup", "sharbat", "roohafza", "750ml"]
  },
  {
    name: "Thums Up Soft Drink (750ml)",
    category: "Beverages",
    price: 40,
    unit: "750ml bottle",
    keywords: ["thums up", "thumbs up", "cold drink", "soda", "cola", "750ml"]
  },
  {
    name: "Thums Up Soft Drink (2L)",
    category: "Beverages",
    price: 95,
    unit: "2L bottle",
    keywords: ["thums up", "thumbs up", "cold drink", "2l bottle", "2l"]
  },
  {
    name: "Coca-Cola Soft Drink (750ml)",
    category: "Beverages",
    price: 40,
    unit: "750ml bottle",
    keywords: ["coca cola", "coke", "cold drink", "soda", "750ml"]
  },
  {
    name: "Coca-Cola Soft Drink (2L)",
    category: "Beverages",
    price: 95,
    unit: "2L bottle",
    keywords: ["coca cola", "coke", "cold drink", "2l"]
  },
  {
    name: "Sprite Lime Soft Drink (750ml)",
    category: "Beverages",
    price: 40,
    unit: "750ml bottle",
    keywords: ["sprite", "cold drink", "clear soda", "lemon drink", "750ml"]
  },
  {
    name: "Sprite Lime Soft Drink (2L)",
    category: "Beverages",
    price: 95,
    unit: "2L bottle",
    keywords: ["sprite", "cold drink", "2l"]
  },
  {
    name: "Limca Lemon Soft Drink (750ml)",
    category: "Beverages",
    price: 40,
    unit: "750ml bottle",
    keywords: ["limca", "lemon soda", "cold drink", "750ml"]
  },
  {
    name: "Fanta Orange Soft Drink (750ml)",
    category: "Beverages",
    price: 40,
    unit: "750ml bottle",
    keywords: ["fanta", "orange soda", "cold drink", "750ml"]
  },
  {
    name: "Maaza Mango Drink (1.2L)",
    category: "Beverages",
    price: 75,
    unit: "1.2L bottle",
    keywords: ["maaza", "mango drink", "mango juice", "aam ras", "1.2l"]
  },
  {
    name: "Maaza Mango Drink (600ml)",
    category: "Beverages",
    price: 40,
    unit: "600ml bottle",
    keywords: ["maaza", "mango drink", "600ml"]
  },
  {
    name: "Frooti Mango Drink (1L)",
    category: "Beverages",
    price: 65,
    unit: "1L tetra",
    keywords: ["frooti", "mango drink", "mango juice", "1l"]
  },
  {
    name: "Frooti Mango Drink (150ml)",
    category: "Beverages",
    price: 10,
    unit: "150ml tetra",
    keywords: ["frooti", "mango drink", "small frooti", "150ml"]
  },
  {
    name: "Paper Boat Aamras Mango Fruit Drink (250ml)",
    category: "Beverages",
    price: 35,
    unit: "250ml pouch",
    keywords: ["paper boat", "aamras", "mango drink", "juice", "250ml"]
  },
  {
    name: "Real Fruit Power Mixed Fruit Juice (1L)",
    category: "Beverages",
    price: 130,
    unit: "1L tetra",
    keywords: ["real juice", "mixed fruit juice", "fruit juice", "dabur real", "1l"]
  },
  {
    name: "Real Fruit Power Pomegranate Juice (1L)",
    category: "Beverages",
    price: 145,
    unit: "1L tetra",
    keywords: ["real juice", "anar juice", "pomegranate juice", "1l"]
  },
  {
    name: "Real Fruit Power Guava Juice (1L)",
    category: "Beverages",
    price: 130,
    unit: "1L tetra",
    keywords: ["real juice", "amrood juice", "guava juice", "1l"]
  },
  {
    name: "Bisleri Packaged Mineral Water (1L)",
    category: "Beverages",
    price: 20,
    unit: "1L bottle",
    keywords: ["bisleri", "water bottle", "mineral water", "drinking water", "pani ki botal", "1l"]
  },
  {
    name: "Bisleri Packaged Mineral Water (5L)",
    category: "Beverages",
    price: 70,
    unit: "5L jar",
    keywords: ["bisleri", "water jar", "mineral water", "5l bottle", "5l"]
  },
  {
    name: "Bisleri Packaged Mineral Water (500ml)",
    category: "Beverages",
    price: 10,
    unit: "500ml bottle",
    keywords: ["bisleri", "small water", "mineral water", "500ml"]
  },
  {
    name: "Kinley Packaged Drinking Water (1L)",
    category: "Beverages",
    price: 20,
    unit: "1L bottle",
    keywords: ["kinley", "drinking water", "mineral water", "1l"]
  },

  // ==========================================
  // 8. Personal Care & Grooming
  // ==========================================
  {
    name: "Dettol Original Bathing Soap (125g)",
    category: "Personal Care",
    price: 58,
    unit: "125g bar",
    keywords: ["dettol", "dettol soap", "bathing soap", "sabun", "antiseptic soap", "125g"]
  },
  {
    name: "Dettol Original Bathing Soap (3-Pack - 3x125g)",
    category: "Personal Care",
    price: 165,
    unit: "3x125g pack",
    keywords: ["dettol soap", "dettol 3 pack", "soap multipack", "sabun", "3x125g"]
  },
  {
    name: "Lifebuoy Total 10 Germ Protection Soap (125g)",
    category: "Personal Care",
    price: 45,
    unit: "125g bar",
    keywords: ["lifebuoy", "lifebuoy soap", "germ protection", "sabun", "125g"]
  },
  {
    name: "Dove Cream Beauty Bathing Bar (100g)",
    category: "Personal Care",
    price: 72,
    unit: "100g bar",
    keywords: ["dove", "dove soap", "beauty bar", "moisturizing soap", "sabun", "100g"]
  },
  {
    name: "Dove Cream Beauty Bathing Bar (3-Pack - 3x100g)",
    category: "Personal Care",
    price: 205,
    unit: "3x100g pack",
    keywords: ["dove soap", "dove 3 pack", "beauty bar", "sabun", "3x100g"]
  },
  {
    name: "Pears Pure & Gentle Bathing Bar (125g)",
    category: "Personal Care",
    price: 78,
    unit: "125g bar",
    keywords: ["pears", "pears soap", "glycerine soap", "sabun", "125g"]
  },
  {
    name: "Lux Velvet Glow Jasmine & Vitamin E Soap (100g)",
    category: "Personal Care",
    price: 42,
    unit: "100g bar",
    keywords: ["lux", "lux soap", "jasmine soap", "sabun", "100g"]
  },
  {
    name: "Cinthol Original Deodorant Bathing Soap (100g)",
    category: "Personal Care",
    price: 48,
    unit: "100g bar",
    keywords: ["cinthol", "cinthol soap", "deo soap", "sabun", "100g"]
  },
  {
    name: "Medimix Ayurvedic 18 Herbs Classic Soap (125g)",
    category: "Personal Care",
    price: 52,
    unit: "125g bar",
    keywords: ["medimix", "ayurvedic soap", "neem soap", "sabun", "125g"]
  },
  {
    name: "Colgate Strong Teeth Toothpaste (100g)",
    category: "Personal Care",
    price: 65,
    unit: "100g tube",
    keywords: ["colgate", "colgate strong teeth", "toothpaste", "dant manjan", "paste", "100g"]
  },
  {
    name: "Colgate Strong Teeth Toothpaste (200g)",
    category: "Personal Care",
    price: 115,
    unit: "200g tube",
    keywords: ["colgate", "colgate strong teeth", "toothpaste", "200g"]
  },
  {
    name: "Colgate MaxFresh Spicy Red Gel Toothpaste (150g)",
    category: "Personal Care",
    price: 110,
    unit: "150g tube",
    keywords: ["colgate maxfresh", "max fresh", "red gel", "colgate", "toothpaste", "150g"]
  },
  {
    name: "Close Up Everfresh Red Hot Gel Toothpaste (150g)",
    category: "Personal Care",
    price: 110,
    unit: "150g tube",
    keywords: ["close up", "closeup", "red hot gel", "toothpaste", "paste", "150g"]
  },
  {
    name: "Sensodyne Fresh Gel Sensitive Toothpaste (150g)",
    category: "Personal Care",
    price: 210,
    unit: "150g tube",
    keywords: ["sensodyne", "sensitive toothpaste", "fresh gel", "toothpaste", "150g"]
  },
  {
    name: "Sensodyne Fresh Gel Sensitive Toothpaste (75g)",
    category: "Personal Care",
    price: 115,
    unit: "75g tube",
    keywords: ["sensodyne", "sensitive toothpaste", "75g"]
  },
  {
    name: "Dabur Red Ayurvedic Toothpaste (200g)",
    category: "Personal Care",
    price: 125,
    unit: "200g tube",
    keywords: ["dabur red", "red paste", "ayurvedic toothpaste", "toothpaste", "dant manjan", "200g"]
  },
  {
    name: "Pepsodent Germi Check Toothpaste (150g)",
    category: "Personal Care",
    price: 90,
    unit: "150g tube",
    keywords: ["pepsodent", "germi check", "toothpaste", "paste", "150g"]
  },
  {
    name: "Oral-B Shiny Clean Toothbrush (Medium - Pack of 2)",
    category: "Personal Care",
    price: 45,
    unit: "pack of 2",
    keywords: ["oral b", "toothbrush", "brush", "pack of 2"]
  },
  {
    name: "Colgate ZigZag Toothbrush (Medium - Pack of 3)",
    category: "Personal Care",
    price: 65,
    unit: "pack of 3",
    keywords: ["colgate zigzag", "toothbrush", "zigzag brush", "brush", "pack of 3"]
  },
  {
    name: "Clinic Plus Strong & Long Shampoo (175ml)",
    category: "Personal Care",
    price: 120,
    unit: "175ml bottle",
    keywords: ["clinic plus", "shampoo", "strong and long", "balon ka shampoo", "175ml"]
  },
  {
    name: "Clinic Plus Strong & Long Shampoo (340ml)",
    category: "Personal Care",
    price: 225,
    unit: "340ml bottle",
    keywords: ["clinic plus", "shampoo", "340ml"]
  },
  {
    name: "Head & Shoulders Cool Menthol Anti-Dandruff Shampoo (180ml)",
    category: "Personal Care",
    price: 190,
    unit: "180ml bottle",
    keywords: ["head and shoulders", "cool menthol", "anti dandruff", "shampoo", "180ml"]
  },
  {
    name: "Head & Shoulders Cool Menthol Anti-Dandruff Shampoo (340ml)",
    category: "Personal Care",
    price: 360,
    unit: "340ml bottle",
    keywords: ["head and shoulders", "cool menthol", "shampoo", "340ml"]
  },
  {
    name: "Dove Intense Repair Hair Shampoo (180ml)",
    category: "Personal Care",
    price: 195,
    unit: "180ml bottle",
    keywords: ["dove shampoo", "intense repair", "shampoo", "180ml"]
  },
  {
    name: "Sunsilk Black Shine Shampoo (180ml)",
    category: "Personal Care",
    price: 135,
    unit: "180ml bottle",
    keywords: ["sunsilk", "black shine", "shampoo", "180ml"]
  },
  {
    name: "Pantene Pro-V Hair Fall Control Shampoo (180ml)",
    category: "Personal Care",
    price: 180,
    unit: "180ml bottle",
    keywords: ["pantene", "hair fall control", "shampoo", "180ml"]
  },
  {
    name: "Parachute 100% Pure Coconut Hair Oil (100ml)",
    category: "Personal Care",
    price: 52,
    unit: "100ml bottle",
    keywords: ["parachute", "coconut oil", "hair oil", "nariyal tel", "100ml"]
  },
  {
    name: "Parachute 100% Pure Coconut Hair Oil (200ml)",
    category: "Personal Care",
    price: 95,
    unit: "200ml bottle",
    keywords: ["parachute", "coconut oil", "hair oil", "nariyal tel", "200ml"]
  },
  {
    name: "Parachute 100% Pure Coconut Hair Oil (500ml)",
    category: "Personal Care",
    price: 215,
    unit: "500ml bottle",
    keywords: ["parachute", "coconut oil", "hair oil", "nariyal tel", "500ml"]
  },
  {
    name: "Bajaj Almond Drops Non-Sticky Hair Oil (100ml)",
    category: "Personal Care",
    price: 75,
    unit: "100ml bottle",
    keywords: ["bajaj almond", "almond oil", "badam tel", "hair oil", "100ml"]
  },
  {
    name: "Bajaj Almond Drops Non-Sticky Hair Oil (200ml)",
    category: "Personal Care",
    price: 145,
    unit: "200ml bottle",
    keywords: ["bajaj almond", "almond drops", "badam tel", "hair oil", "200ml"]
  },
  {
    name: "Dabur Amla Hair Oil (180ml)",
    category: "Personal Care",
    price: 95,
    unit: "180ml bottle",
    keywords: ["dabur amla", "amla oil", "hair oil", "amla tel", "180ml"]
  },
  {
    name: "Nivea Soft Light Moisturiser Cream (100ml)",
    category: "Personal Care",
    price: 185,
    unit: "100ml tub",
    keywords: ["nivea soft", "moisturiser", "face cream", "nivea cream", "100ml"]
  },
  {
    name: "Nivea Creme All Purpose Cream (100ml)",
    category: "Personal Care",
    price: 175,
    unit: "100ml tin",
    keywords: ["nivea creme", "blue tin", "cold cream", "nivea", "100ml"]
  },
  {
    name: "Vaseline Deep Moisture Body Lotion (200ml)",
    category: "Personal Care",
    price: 195,
    unit: "200ml bottle",
    keywords: ["vaseline", "body lotion", "deep moisture", "lotion", "200ml"]
  },
  {
    name: "Vaseline Deep Moisture Body Lotion (400ml)",
    category: "Personal Care",
    price: 360,
    unit: "400ml pump bottle",
    keywords: ["vaseline", "body lotion", "pump bottle", "400ml"]
  },
  {
    name: "Vaseline Pure Petroleum Jelly Original (50g)",
    category: "Personal Care",
    price: 55,
    unit: "50g tub",
    keywords: ["vaseline", "petroleum jelly", "lip care", "vaseline jelly", "50g"]
  },
  {
    name: "Vaseline Pure Petroleum Jelly Original (100g)",
    category: "Personal Care",
    price: 105,
    unit: "100g tub",
    keywords: ["vaseline", "petroleum jelly", "100g"]
  },
  {
    name: "Boroline Antiseptic Ayurvedic Cream (20g)",
    category: "Personal Care",
    price: 45,
    unit: "20g tube",
    keywords: ["boroline", "antiseptic cream", "chapped lips", "20g"]
  },
  {
    name: "BoroPlus Antiseptic Light Cream (40ml)",
    category: "Personal Care",
    price: 50,
    unit: "40ml tube",
    keywords: ["boroplus", "antiseptic cream", "boroplus cream", "40ml"]
  },
  {
    name: "Dettol Antiseptic Disinfectant Liquid (250ml)",
    category: "Personal Care",
    price: 140,
    unit: "250ml bottle",
    keywords: ["dettol liquid", "antiseptic liquid", "first aid", "dettol", "250ml"]
  },
  {
    name: "Dettol Antiseptic Disinfectant Liquid (550ml)",
    category: "Personal Care",
    price: 260,
    unit: "550ml bottle",
    keywords: ["dettol liquid", "antiseptic liquid", "550ml"]
  },
  {
    name: "Savlon Antiseptic Liquid (200ml)",
    category: "Personal Care",
    price: 95,
    unit: "200ml bottle",
    keywords: ["savlon", "antiseptic liquid", "first aid", "200ml"]
  },
  {
    name: "Dettol Original Liquid Handwash Refill Pouch (675ml)",
    category: "Personal Care",
    price: 99,
    unit: "675ml pouch",
    keywords: ["dettol handwash", "handwash refill", "sabun refill", "liquid soap", "675ml"]
  },
  {
    name: "Lifebuoy Total 10 Handwash Refill Pouch (700ml)",
    category: "Personal Care",
    price: 95,
    unit: "700ml pouch",
    keywords: ["lifebuoy handwash", "handwash refill", "liquid handwash", "700ml"]
  },
  {
    name: "Gillette Classic Regular Pre-Shave Shaving Foam (200g)",
    category: "Personal Care",
    price: 185,
    unit: "200g can",
    keywords: ["gillette", "shaving foam", "shaving cream", "foam", "200g"]
  },
  {
    name: "Gillette Guard Men's Shaving Razor",
    category: "Personal Care",
    price: 25,
    unit: "1 razor",
    keywords: ["gillette guard", "razor", "shaving blade", "shave"]
  },
  {
    name: "Whisper Ultra Clean Sanitary Pads Wings (XL - 15 Pads)",
    category: "Personal Care",
    price: 175,
    unit: "pack of 15",
    keywords: ["whisper", "sanitary pads", "pads", "wings", "ultra clean", "15 pads"]
  },
  {
    name: "Stayfree Secure Regular Cottony Sanitary Pads (18 Pads)",
    category: "Personal Care",
    price: 95,
    unit: "pack of 18",
    keywords: ["stayfree", "sanitary pads", "cottony pads", "18 pads"]
  },

  // ==========================================
  // 9. Cleaning & Household
  // ==========================================
  {
    name: "Surf Excel Easy Wash Detergent Powder (1kg)",
    category: "Household & Cleaning",
    price: 135,
    unit: "1kg pack",
    keywords: ["surf excel", "easy wash", "detergent powder", "washing powder", "laundry", "laundry detergent", "surf", "kapde dhone ka", "1kg"]
  },
  {
    name: "Surf Excel Easy Wash Detergent Powder (3kg)",
    category: "Household & Cleaning",
    price: 380,
    unit: "3kg pack",
    keywords: ["surf excel", "easy wash", "detergent powder", "laundry", "laundry detergent", "surf", "3kg"]
  },
  {
    name: "Surf Excel Quick Wash Detergent Powder (1kg)",
    category: "Household & Cleaning",
    price: 215,
    unit: "1kg pack",
    keywords: ["surf excel", "quick wash", "detergent powder", "laundry", "laundry detergent", "1kg"]
  },
  {
    name: "Ariel Complete Detergent Powder (1kg)",
    category: "Household & Cleaning",
    price: 145,
    unit: "1kg pack",
    keywords: ["ariel", "ariel complete", "detergent powder", "washing powder", "laundry", "laundry detergent", "1kg"]
  },
  {
    name: "Tide Plus Extra Power Detergent Powder Lemon & Mint (1kg)",
    category: "Household & Cleaning",
    price: 115,
    unit: "1kg pack",
    keywords: ["tide", "tide plus", "detergent powder", "washing powder", "laundry", "laundry detergent", "1kg"]
  },
  {
    name: "Tide Plus Extra Power Detergent Powder Lemon & Mint (3kg)",
    category: "Household & Cleaning",
    price: 325,
    unit: "3kg pack",
    keywords: ["tide", "tide plus", "detergent powder", "laundry", "laundry detergent", "3kg"]
  },
  {
    name: "Rin Advanced Detergent Bar (250g)",
    category: "Household & Cleaning",
    price: 25,
    unit: "250g bar",
    keywords: ["rin", "rin bar", "detergent bar", "kapde dhone ka sabun", "rin sabun", "250g"]
  },
  {
    name: "Rin Advanced Detergent Bar (Pack of 4 - 4x250g)",
    category: "Household & Cleaning",
    price: 95,
    unit: "pack of 4",
    keywords: ["rin", "rin bar 4 pack", "detergent bar", "multipack", "pack of 4"]
  },
  {
    name: "Wheel 2in1 Clean & Fresh Detergent Powder (1kg)",
    category: "Household & Cleaning",
    price: 70,
    unit: "1kg pack",
    keywords: ["wheel", "wheel powder", "detergent powder", "active wheel", "1kg"]
  },
  {
    name: "Ghari Detergent Powder (1kg)",
    category: "Household & Cleaning",
    price: 65,
    unit: "1kg pack",
    keywords: ["ghari", "ghadi", "pehle istemal kare", "detergent powder", "1kg"]
  },
  {
    name: "Comfort After Wash Morning Fresh Fabric Conditioner (860ml)",
    category: "Household & Cleaning",
    price: 220,
    unit: "860ml bottle",
    keywords: ["comfort", "fabric conditioner", "softener", "kapde khushboo", "860ml"]
  },
  {
    name: "Vim Dishwash Liquid Gel Lemon (250ml)",
    category: "Household & Cleaning",
    price: 58,
    unit: "250ml bottle",
    keywords: ["vim liquid", "dishwash gel", "bartan dhone ka", "lemon gel", "vim", "250ml"]
  },
  {
    name: "Vim Dishwash Liquid Gel Lemon (500ml)",
    category: "Household & Cleaning",
    price: 105,
    unit: "500ml bottle",
    keywords: ["vim liquid", "dishwash gel", "bartan dhone ka", "lemon gel", "vim", "500ml"]
  },
  {
    name: "Vim Dishwash Liquid Gel Lemon Refill (750ml)",
    category: "Household & Cleaning",
    price: 140,
    unit: "750ml pouch",
    keywords: ["vim refill", "dishwash gel pouch", "vim liquid", "750ml"]
  },
  {
    name: "Vim Dishwash Bar Lemon (300g)",
    category: "Household & Cleaning",
    price: 35,
    unit: "300g tub",
    keywords: ["vim bar", "dishwash bar", "bartan sabun", "vim sabun", "300g"]
  },
  {
    name: "Vim Dishwash Bar Lemon (Pack of 3 - 3x135g)",
    category: "Household & Cleaning",
    price: 30,
    unit: "pack of 3",
    keywords: ["vim bar", "dishwash bar", "vim sabun", "pack of 3"]
  },
  {
    name: "Pril Lime Dishwash Liquid (425ml)",
    category: "Household & Cleaning",
    price: 110,
    unit: "425ml bottle",
    keywords: ["pril", "dishwash liquid", "lime gel", "pril liquid", "425ml"]
  },
  {
    name: "Scotch-Brite Heavy Duty Scrub Pad (Pack of 3)",
    category: "Household & Cleaning",
    price: 45,
    unit: "pack of 3",
    keywords: ["scotch brite", "scrub pad", "bartan manjhne wala", "green scrub", "pack of 3"]
  },
  {
    name: "Scotch-Brite Sponge Wipe (Pack of 3)",
    category: "Household & Cleaning",
    price: 125,
    unit: "pack of 3",
    keywords: ["sponge wipe", "scotch brite", "kitchen wipe", "pack of 3"]
  },
  {
    name: "Harpic Power Plus Disinfectant Toilet Cleaner Original (500ml)",
    category: "Household & Cleaning",
    price: 99,
    unit: "500ml bottle",
    keywords: ["harpic", "toilet cleaner", "power plus", "bathroom cleaner", "500ml"]
  },
  {
    name: "Harpic Power Plus Disinfectant Toilet Cleaner Original (1L)",
    category: "Household & Cleaning",
    price: 185,
    unit: "1L bottle",
    keywords: ["harpic", "toilet cleaner", "power plus", "1l"]
  },
  {
    name: "Lizol Disinfectant Surface Floor Cleaner Citrus (500ml)",
    category: "Household & Cleaning",
    price: 110,
    unit: "500ml bottle",
    keywords: ["lizol", "floor cleaner", "pocha lagane ka", "disinfectant", "citrus", "500ml"]
  },
  {
    name: "Lizol Disinfectant Surface Floor Cleaner Citrus (1L)",
    category: "Household & Cleaning",
    price: 205,
    unit: "1L bottle",
    keywords: ["lizol", "floor cleaner", "pocha cleaner", "1l"]
  },
  {
    name: "Lizol Disinfectant Surface Floor Cleaner Pine (500ml)",
    category: "Household & Cleaning",
    price: 110,
    unit: "500ml bottle",
    keywords: ["lizol pine", "floor cleaner", "500ml"]
  },
  {
    name: "Colin Glass and Surface Cleaner (500ml)",
    category: "Household & Cleaning",
    price: 105,
    unit: "500ml spray",
    keywords: ["colin", "glass cleaner", "shisha saaf karne wala", "surface cleaner", "500ml"]
  },
  {
    name: "Good Knight Gold Flash Liquid Mosquito Refill (45ml)",
    category: "Household & Cleaning",
    price: 85,
    unit: "45ml bottle",
    keywords: ["good knight", "machhar refill", "mosquito liquid", "all out refill", "45ml"]
  },
  {
    name: "Good Knight Gold Flash Machine + Refill Combo",
    category: "Household & Cleaning",
    price: 120,
    unit: "combo pack",
    keywords: ["good knight machine", "mosquito machine", "combo", "machhar machine"]
  },
  {
    name: "All Out Ultra Mosquito Repellent Liquid Refill (45ml)",
    category: "Household & Cleaning",
    price: 85,
    unit: "45ml bottle",
    keywords: ["all out", "all out refill", "mosquito repellent", "machhar repellent", "45ml"]
  },
  {
    name: "Kala HIT Mosquito & Fly Killer Spray (400ml)",
    category: "Household & Cleaning",
    price: 195,
    unit: "400ml spray",
    keywords: ["kala hit", "hit spray", "mosquito spray", "machhar spray", "400ml"]
  },
  {
    name: "Lal HIT Cockroach Killer Spray (400ml)",
    category: "Household & Cleaning",
    price: 205,
    unit: "400ml spray",
    keywords: ["lal hit", "cockroach spray", "hit spray", "red hit", "400ml"]
  },
  {
    name: "Odonil Room Air Freshener Block Lavender (50g)",
    category: "Household & Cleaning",
    price: 55,
    unit: "50g block",
    keywords: ["odonil", "air freshener", "bathroom freshener", "lavender", "50g"]
  },
  {
    name: "Odonil Room Air Freshener Block Jasmine (50g)",
    category: "Household & Cleaning",
    price: 55,
    unit: "50g block",
    keywords: ["odonil", "jasmine freshener", "air freshener", "50g"]
  },
  {
    name: "Ship Matchboxes (Pack of 10 Boxes)",
    category: "Household & Cleaning",
    price: 20,
    unit: "bundle of 10",
    keywords: ["matchbox", "machis", "maachis", "ship machis", "pack of 10"]
  },
  {
    name: "Oxo-Biodegradable Medium Garbage Bags (Pack of 30)",
    category: "Household & Cleaning",
    price: 90,
    unit: "pack of 30",
    keywords: ["garbage bags", "dustbin bags", "kachra bag", "dustbin cover", "pack of 30"]
  },
  {
    name: "Freshwrapp Aluminium Foil (9m)",
    category: "Household & Cleaning",
    price: 95,
    unit: "9m roll",
    keywords: ["freshwrapp", "aluminium foil", "foil paper", "roti wrap", "9m"]
  },

  // ==========================================
  // 10. Chocolates & Confectionery
  // ==========================================
  {
    name: "Cadbury Dairy Milk Chocolate (24g)",
    category: "Chocolates & Sweets",
    price: 20,
    unit: "bar (24g)",
    keywords: ["cadbury", "dairy milk", "chocolate", "meetha", "24g", "cadbury chocolate"]
  },
  {
    name: "Cadbury Dairy Milk Chocolate (50g)",
    category: "Chocolates & Sweets",
    price: 45,
    unit: "bar (50g)",
    keywords: ["cadbury", "dairy milk", "chocolate", "50g"]
  },
  {
    name: "Cadbury Dairy Milk Roast Almond (36g)",
    category: "Chocolates & Sweets",
    price: 45,
    unit: "bar (36g)",
    keywords: ["dairy milk roast almond", "badam chocolate", "cadbury", "36g"]
  },
  {
    name: "Cadbury Dairy Milk Fruit & Nut (36g)",
    category: "Chocolates & Sweets",
    price: 45,
    unit: "bar (36g)",
    keywords: ["dairy milk fruit and nut", "fruit & nut", "cadbury", "36g"]
  },
  {
    name: "Cadbury Dairy Milk Silk Chocolate (60g)",
    category: "Chocolates & Sweets",
    price: 80,
    unit: "bar (60g)",
    keywords: ["cadbury silk", "silk chocolate", "dairy milk silk", "silk", "60g"]
  },
  {
    name: "Cadbury Dairy Milk Silk Chocolate (150g)",
    category: "Chocolates & Sweets",
    price: 180,
    unit: "bar (150g)",
    keywords: ["cadbury silk", "silk chocolate", "dairy milk silk", "150g"]
  },
  {
    name: "Cadbury 5 Star Chocolate Bar (40g)",
    category: "Chocolates & Sweets",
    price: 20,
    unit: "bar (40g)",
    keywords: ["5 star", "five star", "cadbury 5 star", "caramel chocolate", "40g"]
  },
  {
    name: "Nestle KitKat 4 Finger Chocolate Bar (38.5g)",
    category: "Chocolates & Sweets",
    price: 30,
    unit: "bar (38.5g)",
    keywords: ["kitkat", "kit kat", "nestle kitkat", "wafer chocolate", "have a break", "38.5g"]
  },
  {
    name: "Nestle KitKat 2 Finger Chocolate Bar (18g)",
    category: "Chocolates & Sweets",
    price: 10,
    unit: "bar (18g)",
    keywords: ["kitkat", "kit kat", "small kitkat", "10 rs kitkat", "18g"]
  },
  {
    name: "Nestle Munch Crunchy Wafer Bar (20g)",
    category: "Chocolates & Sweets",
    price: 10,
    unit: "bar (20g)",
    keywords: ["munch", "nestle munch", "crunchy wafer", "10 rs chocolate", "20g"]
  },
  {
    name: "Cadbury Perk Wafer Chocolate Bar (28g)",
    category: "Chocolates & Sweets",
    price: 10,
    unit: "bar (28g)",
    keywords: ["perk", "cadbury perk", "wafer bar", "10 rs perk", "28g"]
  },
  {
    name: "Cadbury Gems Chocolate Buttons (25g)",
    category: "Chocolates & Sweets",
    price: 20,
    unit: "pack (25g)",
    keywords: ["gems", "cadbury gems", "colorful buttons", "chocolate gems", "25g"]
  },
  {
    name: "Snickers Peanut Chocolate Bar (45g)",
    category: "Chocolates & Sweets",
    price: 50,
    unit: "bar (45g)",
    keywords: ["snickers", "peanut chocolate", "nougat bar", "snickers bar", "45g"]
  },
  {
    name: "Pass Pass Pulse Tangy Mango Candy (Pack of 50 Candies)",
    category: "Chocolates & Sweets",
    price: 50,
    unit: "pouch (50 pcs)",
    keywords: ["pulse candy", "tangy mango", "kachha aam toffee", "pulse", "50 pcs"]
  },
  {
    name: "Alpenliebe Gold Caramel Toffee (Pouch of 40 Candies)",
    category: "Chocolates & Sweets",
    price: 50,
    unit: "pouch (40 pcs)",
    keywords: ["alpenliebe", "caramel toffee", "alpenliebe gold", "toffee", "40 pcs"]
  },

  // ==========================================
  // 11. Pooja & Dry Fruits
  // ==========================================
  {
    name: "Cycle Pure Agarbathies Three in One (150g)",
    category: "Pooja & Household",
    price: 65,
    unit: "150g pack",
    keywords: ["agarbatti", "cycle agarbatti", "three in one", "incense sticks", "dhoop", "150g"]
  },
  {
    name: "Mangaldeep Temple Lord Shiva Agarbatti (Pack of 1)",
    category: "Pooja & Household",
    price: 50,
    unit: "pack of 1",
    keywords: ["mangaldeep", "agarbatti", "itc agarbatti", "pooja agarbatti"]
  },
  {
    name: "Camphor Pure Camphor Tablets / Kapur (50g)",
    category: "Pooja & Household",
    price: 60,
    unit: "50g box",
    keywords: ["kapur", "camphor", "puja kapoor", "kapur tablet", "50g"]
  },
  {
    name: "Diya Round Cotton Wicks / Phool Batti (100 pcs)",
    category: "Pooja & Household",
    price: 40,
    unit: "pack of 100",
    keywords: ["phool batti", "cotton wicks", "diya batti", "ruii batti", "100 pcs"]
  },
  {
    name: "Happilo 100% Natural Premium California Almonds (Badam) (200g)",
    category: "Dry Fruits & Nuts",
    price: 215,
    unit: "200g pouch",
    keywords: ["happilo", "almonds", "badam", "california almonds", "dry fruits", "200g"]
  },
  {
    name: "Happilo 100% Natural Premium California Almonds (Badam) (500g)",
    category: "Dry Fruits & Nuts",
    price: 490,
    unit: "500g pouch",
    keywords: ["happilo", "almonds", "badam", "dry fruits", "500g"]
  },
  {
    name: "Happilo 100% Natural Premium Whole Cashews (Kaju) (200g)",
    category: "Dry Fruits & Nuts",
    price: 245,
    unit: "200g pouch",
    keywords: ["happilo", "cashews", "kaju", "whole cashew", "dry fruits", "200g"]
  },
  {
    name: "Happilo 100% Natural Premium Whole Cashews (Kaju) (500g)",
    category: "Dry Fruits & Nuts",
    price: 575,
    unit: "500g pouch",
    keywords: ["happilo", "cashews", "kaju", "dry fruits", "500g"]
  },
  {
    name: "Happilo Premium Seedless Green Raisins (Kismis) (250g)",
    category: "Dry Fruits & Nuts",
    price: 110,
    unit: "250g pouch",
    keywords: ["raisins", "kismis", "kishmish", "green raisins", "dry fruits", "250g"]
  },
  {
    name: "Happilo Premium California Walnuts Inshell (Akhrot) (250g)",
    category: "Dry Fruits & Nuts",
    price: 230,
    unit: "250g pouch",
    keywords: ["walnuts", "akhrot", "dry fruits", "california walnuts", "250g"]
  },
  {
    name: "Colgate Strong Teeth Toothpaste (50g)",
    category: "Personal Care",
    price: 30,
    unit: "50g tube",
    keywords: ["colgate", "colgate 50g", "small colgate", "toothpaste", "paste", "50g"]
  }
];

const formatted = items.map((it, idx) => ({
  id: `p${idx + 1}`,
  name: it.name,
  category: it.category,
  price: it.price,
  unit: it.unit,
  inStock: true,
  keywords: Array.from(new Set([
    it.name.toLowerCase(),
    it.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
    ...(it.keywords || []).map(k => k.toLowerCase())
  ]))
}));

fs.writeFileSync(CATALOG_PATH, JSON.stringify(formatted, null, 2), 'utf8');
console.log(`Saved ${formatted.length} products to ${CATALOG_PATH}`);
