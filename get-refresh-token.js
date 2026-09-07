require('dotenv').config();
const readline = require('readline');
const { google } = require('googleapis');

/**
 * ONE-TIME SETUP SCRIPT. Run this once with:
 *   node get-refresh-token.js
 *
 * Requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET already
 * in your .env (get these from Google Cloud Console → APIs & Services
 * → Credentials → OAuth client ID, type "Desktop app").
 *
 * This will print a URL. Open it, log in with the Google account whose
 * Drive you want to upload to, approve access, then copy the code Google
 * shows you and paste it back into this terminal when prompted.
 *
 * At the end it prints GOOGLE_OAUTH_REFRESH_TOKEN — copy that into your
 * .env and you're done. You never need to run this script again unless
 * you revoke access.
 */

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env.');
  process.exit(1);
}

// "urn:ietf:wg:oauth:2.0:oob" is the redirect for apps with no web server —
// Google shows the code directly on screen instead of redirecting.
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets', // added for MCP server Sheets tools
  ],
  prompt: 'consent', // forces Google to always issue a refresh token
});

console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Approve access, then copy the code Google shows you.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('3. Paste the code here and press Enter: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.error(
        '\nNo refresh token returned. This usually means you\'ve authorized this app before. ' +
          'Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.'
      );
      process.exit(1);
    }
    console.log('\n✅ Success. Add this line to your .env:\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('');
  } catch (err) {
    console.error('\nFailed to exchange code for tokens:', err.message);
    process.exit(1);
  }
});
