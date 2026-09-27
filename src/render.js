const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'invoice-template.html');

function formatMoney(n) {
  return Number(n).toFixed(2);
}

function buildItemsRowsHtml(lines) {
  return lines
    .map(
      (line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${line.product_name}${line.weight_size ? ` (${line.weight_size})` : ''}</td>
          <td class="num">${line.quantity}</td>
          <td class="num">${formatMoney(line.unit_price)}</td>
          <td class="num">${formatMoney(line.discount)}</td>
          <td class="num">${formatMoney(line.amount)}</td>
        </tr>`
    )
    .join('\n');
}

/**
 * Fills the HTML template with order + pricing data.
 * Returns a complete HTML string ready for PDF conversion.
 */
function renderInvoiceHtml({ order, pricing, invoiceNumber, invoiceDate }) {
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const replacements = {
    '{{CUSTOMER_NAME}}': order.customer_name || '',
    '{{CUSTOMER_ADDRESS}}': order.customer_address || '',
    '{{CUSTOMER_PHONE}}': order.customer_phone || '',
    '{{INVOICE_NUMBER}}': invoiceNumber,
    '{{INVOICE_DATE}}': invoiceDate,
    '{{PAYMENT_METHOD}}': order.payment_method || '',
    '{{ITEMS_ROWS}}': buildItemsRowsHtml(pricing.lines),
    '{{SUBTOTAL}}': formatMoney(pricing.subtotal),
    '{{GRAND_TOTAL}}': formatMoney(pricing.grand_total),
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.split(placeholder).join(value);
  }

  return html;
}

module.exports = { renderInvoiceHtml };
