const puppeteer = require('puppeteer');

/**
 * Converts a complete HTML string into a PDF file on disk.
 */
async function htmlToPdf(html, outputPath) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
  } finally {
    await browser.close();
  }
}

module.exports = { htmlToPdf };
