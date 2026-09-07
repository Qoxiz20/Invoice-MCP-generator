const { loadCatalog } = require('./catalog');

/**
 * Thrown when a search query doesn't confidently match exactly one product.
 * type: 'no_match' | 'ambiguous'
 * candidates: array of {barcode, product_name, weight_size} — populated for 'ambiguous'
 */
class MatchError extends Error {
  constructor(message, type, candidates = []) {
    super(message);
    this.name = 'MatchError';
    this.type = type;
    this.candidates = candidates;
  }
}

function normalize(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Scores how well a query matches a product name.
 * Score = number of query tokens that appear in the product name tokens
 * (as exact token match or as a substring within a product token).
 * This is intentionally simple/transparent, not a black-box fuzzy library —
 * easy to reason about why something did or didn't match.
 */
function scoreMatch(queryTokens, productTokens) {
  let score = 0;
  for (const qt of queryTokens) {
    const hit = productTokens.some((pt) => pt === qt || pt.includes(qt) || qt.includes(pt));
    if (hit) score += 1;
  }
  return score;
}

/**
 * Resolves a free-text search query (e.g. "button mushroom") to exactly
 * one catalog product.
 *
 * Throws MatchError('no_match') if nothing matches well enough.
 * Throws MatchError('ambiguous') if more than one product ties for the
 * best score — caller must ask the customer/operator to clarify rather
 * than guessing.
 */
function matchProduct(query) {
  const catalog = loadCatalog();
  const queryTokens = normalize(query);

  if (queryTokens.length === 0) {
    throw new MatchError(`Search query "${query}" is empty after normalization.`, 'no_match');
  }

  const scored = catalog.items
    .map((item) => ({
      item,
      score: scoreMatch(queryTokens, normalize(item.product_name)),
    }))
    .filter((s) => s.score > 0);

  if (scored.length === 0) {
    throw new MatchError(
      `No product found matching "${query}". It may be missing from the catalog, or worded differently — check spelling or try fewer words.`,
      'no_match'
    );
  }

  const maxScore = Math.max(...scored.map((s) => s.score));
  const topMatches = scored.filter((s) => s.score === maxScore);

  if (topMatches.length > 1) {
    throw new MatchError(
      `"${query}" matches ${topMatches.length} products equally well — clarification needed.`,
      'ambiguous',
      topMatches.map((m) => ({
        barcode: m.item.barcode,
        product_name: m.item.product_name,
        weight_size: m.item.weight_size,
      }))
    );
  }

  return topMatches[0].item;
}

module.exports = { matchProduct, MatchError };
