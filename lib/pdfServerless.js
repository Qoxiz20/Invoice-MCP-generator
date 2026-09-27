const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');

/**
 * Full puppeteer (used by pdf.js for local runs via generate-invoice.js)
 * does not work reliably on Vercel serverless - deployment size limits,
 * read-only filesystem outside /tmp, no bundled Chromium support. This
 * uses puppeteer-core + @sparticuz/chromium instead, the standard fix
 * for "puppeteer on Vercel." pdf.js itself is left untouched - this is
 * a separate module only used by the Telegram order-to-invoice path.
 *
 * Returns a Buffer (not a file path) - callers upload it directly to
 * Drive rather than reading it back off disk.
 */
async function htmlToPdfBuffer(html) {
  const browser = await puppeteerCore.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports = { htmlToPdfBuffer };
