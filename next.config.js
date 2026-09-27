/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nothing custom needed - the invoice-generator's plain Node scripts
  // (generate-invoice.js, etc.) live alongside this Next.js app but are
  // never bundled or run by Next - they're separate entry points you run
  // directly with `node generate-invoice.js` / `npm run generate`.
};

module.exports = nextConfig;
