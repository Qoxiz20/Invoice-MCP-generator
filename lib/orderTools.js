const { priceOrder, PricingError } = require('../src/pricing');
const { getNextInvoiceNumber } = require('../src/counter');
const { renderInvoiceHtml } = require('../src/render');
const { htmlToPdfBuffer } = require('./pdfServerless');
const { getDriveClient } = require('../src/auth');
const { Readable } = require('stream');

/**
 * The model's job is ONLY to turn "50ctn thai chilli small" into a
 * structured { query, quantity } line - it never sees or invents a
 * price. priceOrder() (existing, already-safe code) does all pricing,
 * and refuses (throws PricingError) rather than guess on any ambiguity
 * or missing price - same fail-safe behavior as the local CLI tool.
 */
const orderToolDefinitions = [
  {
    name: 'price_order',
    description:
      'Given a list of order lines (product query + quantity), returns the correct priced invoice using the real catalog. Throws a clear error if any item is ambiguous or unpriced - does not guess.',
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: { type: 'string', description: "Customer's own words for the product, e.g. 'thai chilli small'" },
              quantity: { type: 'number' },
            },
            required: ['query', 'quantity'],
          },
        },
      },
      required: ['lines'],
    },
  },
  {
    name: 'issue_invoice',
    description:
      'Generates the actual invoice PDF and uploads it to the Sales Invoices folder. Only call this AFTER price_order succeeded with no errors. Does NOT write anything to 02 Accounting.xlsx - that stays a manual monthly reconciliation step.',
    input_schema: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        customerAddress: { type: 'string' },
        customerPhone: { type: 'string' },
        pricedLines: { type: 'array', description: 'The exact lines[] array returned by price_order - pass it through unchanged.' },
        subtotal: { type: 'number' },
        grandTotal: { type: 'number' },
      },
      required: ['customerName', 'pricedLines', 'subtotal', 'grandTotal'],
    },
  },
  {
    name: 'get_catalog_items',
    description:
      "List every product in the catalog with its exact name and weight/size. IMPORTANT: the matcher only searches product_name, NOT weight_size - so vague words like 'small'/'big' will never resolve on their own. Use this tool first to see the real variants (e.g. '980g x 12\\'s' vs '5kg x 3\\'s'), then pass the FULL specific product_name + weight_size as your price_order query - never pass the customer's vague size words through unchanged.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

async function handlePriceOrder({ lines }) {
  try {
    return priceOrder(lines);
  } catch (err) {
    if (err instanceof PricingError) {
      return { error: true, type: err.type, message: err.message, details: err.details };
    }
    throw err;
  }
}

function handleGetCatalogItems() {
  const { loadCatalog } = require('../src/catalog');
  const catalog = loadCatalog();
  return catalog.items.map((i) => ({
    barcode: i.barcode,
    product_name: i.product_name,
    weight_size: i.weight_size,
  }));
}

async function handleIssueInvoice({ customerName, customerAddress, customerPhone, pricedLines, subtotal, grandTotal }) {
  const invoiceNumber = await getNextInvoiceNumber();
  const invoiceDate = new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = renderInvoiceHtml({
    order: { customer_name: customerName, customer_address: customerAddress || '', customer_phone: customerPhone || '' },
    pricing: { lines: pricedLines, subtotal, grand_total: grandTotal },
    invoiceNumber,
    invoiceDate,
  });

  const pdfBuffer = await htmlToPdfBuffer(html);
  const fileName = `${invoiceNumber}.pdf`;

  const drive = getDriveClient();
  const uploaded = await drive.files.create({
    requestBody: { name: fileName, parents: [process.env.SALES_INVOICE_FOLDER_ID] },
    media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
    fields: 'id, webViewLink',
  });

  return {
    invoiceNumber,
    invoiceDate,
    fileName,
    driveFileId: uploaded.data.id,
    driveLink: uploaded.data.webViewLink,
    note: 'PDF created and filed. NOT yet logged in Sales Invoice Log or Inventory Register - that happens during the monthly reconciliation.',
  };
}

async function executeOrderTool(name, input) {
  switch (name) {
    case 'price_order':
      return handlePriceOrder(input);
    case 'issue_invoice':
      return handleIssueInvoice(input);
    case 'get_catalog_items':
      return handleGetCatalogItems();
    default:
      throw new Error(`Unknown order tool: ${name}`);
  }
}

module.exports = { orderToolDefinitions, executeOrderTool };
