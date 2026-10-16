import fs from 'fs';
import os from 'os';
import path from 'path';

// Imported FIRST by any test that must not touch the live whatsapp/store/orders.json.
// ESM evaluates this module (no deps) before the next import, so the order store
// picks up the throwaway path when it is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-test-orders-'));
process.env.DUKAN_ORDERS_FILE = path.join(dir, 'orders.json');
