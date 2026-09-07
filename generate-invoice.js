const path = require('path');
const { priceOrder, PricingError } = require('./src/pricing');
const { getNextInvoiceNumber } = require('./src/counter');
const { renderInvoiceHtml } = require('./src/render');
const { htmlToPdf } = require('./src/pdf');
const { uploadInvoicePdf } = require('./src/drive');

/**
 * Takes a structured order and produces a PDF invoice.
 *
 * order shape:
 * {
 *   customer_name: "ABC Restaurant",
 *   customer_address: "...",
 *   customer_phone: "...",
 *   payment_method: "Bank Transfer",
 *   items: [
 *     { query: "button mushroom", quantity: 5, discount: 0 },
 *     { barcode: "9551029670183", quantity: 2 }  // barcode optional, exact-match shortcut
 *   ]
 * }
 *
 * Each item needs EITHER "query" (free-text product name/description —
 * the normal customer-facing path) OR "barcode" (optional internal exact
 * identifier). If both given, barcode wins.
 *
 * Fails loudly (throws) if any item can't be safely priced OR can't be
 * confidently matched to exactly one product — never guesses, never
 * generates a partial invoice. Ambiguous matches (e.g. "mushroom" matching
 * 4 different mushroom products) throw with a list of candidates so the
 * caller can ask the customer to clarify.
 *
 * options.allowUnpriced: TESTING ONLY. If true, items with no price set
 * are priced at RM0 and clearly marked "(⚠ PRICE TBC)" instead of blocking
 * generation. NEVER pass this as true once real customer orders exist —
 * it exists purely to test the pipeline before the catalog is fully priced.
 */
async function generateInvoice(order, options = {}) {
  if (!order.customer_name) {
    throw new Error('Order is missing customer_name.');
  }
  if (!order.items || order.items.length === 0) {
    throw new Error('Order has no items.');
  }

  // 1. Price the order (deterministic — throws PricingError on any problem,
  //    unless options.allowUnpriced is explicitly set for testing)
  const pricing = priceOrder(order.items, options);

  if (pricing.hasUnpriced) {
    console.warn('⚠️  This invoice contains RM0 placeholder pricing (TEST MODE). Do not send to a real customer.');
  }

  // 2. Get the next running invoice number from Supabase
  const now = new Date();
  const invoiceNumber = await getNextInvoiceNumber(now);
  const invoiceDate = now.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 3. Fill the HTML template
  const html = renderInvoiceHtml({ order, pricing, invoiceNumber, invoiceDate });

  // 4. Convert to PDF and save locally
  const filename = `${invoiceNumber}.pdf`;
  const outputPath = path.join(__dirname, 'output', filename);
  await htmlToPdf(html, outputPath);

  // 5. Upload to Google Drive.
  // The local PDF is already saved at this point — if Drive upload fails
  // (bad credentials, network issue, etc.), we don't throw and lose the
  // invoice; we report the failure clearly and let the caller decide what
  // to do (e.g. retry, or send the local file another way).
  let drive = null;
  try {
    drive = await uploadInvoicePdf({ filePath: outputPath, invoiceNumber, date: now });
  } catch (err) {
    console.error('⚠️  PDF generated locally, but Google Drive upload FAILED:');
    console.error(err.message);
  }

  return { invoiceNumber, outputPath, pricing, drive };
}

// --- Example run (Phase 2 test case) ---
// TEST MODE: allowUnpriced=true lets unpriced items through as RM0 so the
// full pipeline (matching → pricing → numbering → PDF) can be exercised
// before the catalog is fully priced. This is safe ONLY because there are
// no real customers yet. Set back to false (or omit) once pricing real orders.
const TEST_MODE_ALLOW_UNPRICED = true;

if (require.main === module) {
  const testOrder = {
    customer_name: 'ABC Restaurant',
    customer_address: '123 Jalan Test, Kota Kinabalu, Sabah',
    customer_phone: '+60 12-345 6789',
    payment_method: 'Bank Transfer',
    items: [
      { query: 'royal lion potato starch', quantity: 5 }, // fully priced
      { query: 'button mushroom', quantity: 3 }, // unpriced — will show as RM0 (⚠ PRICE TBC)
    ],
  };

  generateInvoice(testOrder, { allowUnpriced: TEST_MODE_ALLOW_UNPRICED })
    .then((result) => {
      console.log('Invoice generated:', result.invoiceNumber);
      console.log('Saved locally to:', result.outputPath);
      if (result.drive) {
        console.log('Uploaded to Google Drive:', result.drive.link);
      } else {
        console.log('NOT uploaded to Google Drive (see error above).');
      }
    })
    .catch((err) => {
      if (err instanceof PricingError) {
        console.error(`PRICING ERROR [${err.type}] — invoice not generated.`);
        console.error(err.message);
        if (err.details && err.details.candidates) {
          console.error('Candidates:');
          err.details.candidates.forEach((c) => console.error(`  - ${c.product_name} (${c.barcode || 'no barcode'})`));
        }
      } else {
        console.error('ERROR — invoice not generated.');
        console.error(err.message);
      }
      process.exitCode = 1;
    });
}

module.exports = { generateInvoice };
