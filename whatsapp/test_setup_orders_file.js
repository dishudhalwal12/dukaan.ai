import fs from 'fs';
import os from 'os';
import path from 'path';

// Imported FIRST by any test that must not touch the live environment.
//
// ESM evaluates this module (no deps) before the next import, so everything below
// is in place before dukanBot.js loads whatsapp/.env or any module reads a store.
//
// 1. Both stores are pinned into one throwaway directory. That also makes the
//    suite hermetic: the catalog starts from the defaults instead of whatever the
//    developer's own store/catalog.json happens to contain (which would otherwise
//    change what a search or a price assertion returns).
// 2. The cloud and model credentials are blanked. A developer's .env holds live
//    Supabase and Groq/OpenRouter keys; without this a test run reads the real
//    shop registry (round-1 bug: test_location_memory went red) and can spend real
//    tokens. Precedence does the work: dotenv never overrides a variable that is
//    already set, and these are set first.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-test-store-'));
process.env.DUKAN_ORDERS_FILE = path.join(dir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(dir, 'catalog.json');

// No live registry, no live model — ever, in a test.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.GROQ_API_KEY = '';
process.env.OPENROUTER_API_KEY = '';
process.env.LLM_BASE_URL = '';
