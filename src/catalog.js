const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'catalog.json');

/**
 * Loads catalog.json fresh from disk.
 * We reload on every call (not cached at module load) so that
 * regenerating catalog.json and restarting the process always
 * picks up the latest data without stale in-memory copies.
 */
function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Finds a single product by barcode.
 * Returns null if not found (caller must handle — never assume).
 */
function findByBarcode(barcode) {
  const catalog = loadCatalog();
  const item = catalog.items.find((i) => i.barcode === String(barcode));
  return item || null;
}

module.exports = { loadCatalog, findByBarcode };
