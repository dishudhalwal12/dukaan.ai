import fs from 'fs';
import os from 'os';
import path from 'path';

// Imported FIRST by any test that must not touch the live whatsapp/store files.
// ESM evaluates this module (no deps) before the next import, so the stores pick
// up the throwaway paths when they are loaded.
//
// Both stores are pinned into one throwaway directory, which also makes the
// suite hermetic: the catalog starts from the defaults instead of whatever the
// developer's own store/catalog.json happens to contain (which would otherwise
// change what a search or a price assertion returns).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dukan-test-store-'));
process.env.DUKAN_ORDERS_FILE = path.join(dir, 'orders.json');
process.env.DUKAN_CATALOG_FILE = path.join(dir, 'catalog.json');
