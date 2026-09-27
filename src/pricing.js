const { findByBarcode } = require('./catalog');
const { matchProduct, MatchError } = require('./matcher');

/**
 * Custom error type so calling code can distinguish
 * "this order can't be safely priced" from a generic bug.
 * type mirrors MatchError types plus pricing-specific ones:
 *   'no_match' | 'ambiguous' | 'no_price' | 'invalid_line'
 */
class PricingError extends Error {
  constructor(message, type, details) {
    super(message);
    this.name = 'PricingError';
    this.type = type;
    this.details = details;
  }
}

/**
 * Resolves an order line to exactly one catalog product.
 *
 * Primary path: customer-facing "query" (e.g. "button mushroom") —
 * resolved via matcher.js, which refuses to guess on ambiguity.
 *
 * Secondary path: "barcode" — an optional exact internal identifier.
 * If provided, it's used directly (unambiguous by definition) and
 * bypasses fuzzy matching entirely. Useful for internal/repeat orders
 * where the exact product is already known.
 *
 * If both are given, barcode wins (it's an exact reference).
 */
function resolveProduct({ query, barcode }) {
  if (barcode) {
    const product = findByBarcode(barcode);
    if (!product) {
      throw new PricingError(`No product found in catalog for barcode ${barcode}.`, 'no_match', {
        barcode,
      });
    }
    return product;
  }

  if (query) {
    try {
      return matchProduct(query);
    } catch (err) {
      if (err instanceof MatchError) {
        throw new PricingError(err.message, err.type, { query, candidates: err.candidates });
      }
      throw err;
    }
  }

  throw new PricingError('Order line has neither a barcode nor a search query.', 'invalid_line', {});
}

/**
 * Picks the correct price-tier key based on quantity ordered.
 * Tiers match catalog.json exactly: 1-3 / 4-10 / 11-20 / 21-49 / 50+
 */
function pickTierKey(quantity) {
  if (quantity <= 3) return '1-3_unit';
  if (quantity <= 10) return '4-10_unit';
  if (quantity <= 20) return '11-20_unit';
  if (quantity <= 49) return '21-49_unit';
  return '50_unit_plus';
}

/**
 * Resolves ONE order line (query or barcode + quantity) into a priced line.
 * Throws PricingError instead of silently guessing if:
 *   - the search query matches zero products
 *   - the search query matches more than one product (ambiguous)
 *   - barcode doesn't exist in catalog
 *   - the matched tier price is null (not filled in yet)
 *
 * allowUnpriced (default false): TESTING ONLY. If true, a missing price
 * is treated as RM0 instead of throwing, and the line is clearly marked
 * so it's impossible to miss on the generated PDF/console output.
 * NEVER enable this once real customer orders are involved — it exists
 * only to test the pipeline mechanics before the catalog is fully priced.
 */
function priceLine({ query, barcode, quantity, discount = 0 }, { allowUnpriced = false } = {}) {
  if (!quantity || quantity <= 0) {
    throw new PricingError('Order line has an invalid quantity.', 'invalid_line', {
      query,
      barcode,
      quantity,
    });
  }

  const product = resolveProduct({ query, barcode });

  const tierKey = pickTierKey(quantity);
  let unitPrice = product.pricing[tierKey];
  let unpriced = false;

  if (unitPrice === null || unitPrice === undefined) {
    if (!allowUnpriced) {
      throw new PricingError(
        `Product "${product.product_name}" has no price set for the ${tierKey} tier. ` +
          `Fill this in the catalog Excel and regenerate catalog.json before invoicing this item.`,
        'no_price',
        { barcode: product.barcode, product_name: product.product_name, tierKey }
      );
    }
    // TEST MODE: treat as RM0, but flag it loudly.
    unitPrice = 0;
    unpriced = true;
    console.warn(
      `⚠️  TEST MODE: "${product.product_name}" has no ${tierKey} price — priced at RM0. NOT SAFE FOR REAL ORDERS.`
    );
  }

  const lineSubtotal = unitPrice * quantity;
  const lineAmount = lineSubtotal - discount;

  return {
    barcode: product.barcode,
    product_name: unpriced ? `${product.product_name} (⚠ PRICE TBC)` : product.product_name,
    weight_size: product.weight_size,
    quantity,
    tier: tierKey,
    unit_price: unitPrice,
    discount,
    amount: Math.round(lineAmount * 100) / 100,
    unpriced,
  };
}

/**
 * Prices every line in an order. Stops on the FIRST problem line
 * and reports it clearly — does not partially invoice an order.
 *
 * options.allowUnpriced: TESTING ONLY — see priceLine() docs. Default false.
 */
function priceOrder(items, options = {}) {
  const lines = items.map((item) => priceLine(item, options));
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

  return {
    lines,
    subtotal: Math.round(subtotal * 100) / 100,
    grand_total: Math.round(subtotal * 100) / 100, // no tax/delivery rows currently
    hasUnpriced: lines.some((l) => l.unpriced),
  };
}

module.exports = { pickTierKey, priceLine, priceOrder, PricingError };
