const { google } = require('googleapis');

/**
 * Single shared OAuth client for the whole project - used by both the
 * existing invoice Drive upload (src/drive.js) and the new MCP Sheets/Drive
 * tools. Previously each had its own copy of this same logic; now it lives
 * in one place.
 *
 * Requires in .env:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REFRESH_TOKEN   - generated via get-refresh-token.js
 *
 * IMPORTANT: if you generated your refresh token before adding the MCP
 * server, re-run get-refresh-token.js once - it now requests the Sheets
 * scope in addition to Drive, and old tokens won't have that permission.
 */

let cachedClient = null;

function getAuthClient() {
  if (cachedClient) return cachedClient;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REFRESH_TOKEN in .env. ' +
        'Run get-refresh-token.js once to generate the refresh token.'
    );
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  // TEMPORARY DIAGNOSTIC - remove once the invalid_grant issue is resolved.
  // Proactively tests the refresh token and logs Google's real error
  // response (never the token/secret itself) so the actual cause shows up
  // in Vercel logs on the very next request, not just our generic
  // "invalid_grant" label.
  oAuth2Client
    .getAccessToken()
    .then(() => console.log('[auth diagnostic] Google refresh token is valid - access token obtained OK.'))
    .catch((err) => {
      console.error('[auth diagnostic] Google refresh token FAILED.');
      console.error('[auth diagnostic] error code:', err.response?.data?.error);
      console.error('[auth diagnostic] error description:', err.response?.data?.error_description);
      console.error('[auth diagnostic] http status:', err.response?.status);
    });

  cachedClient = oAuth2Client;
  return oAuth2Client;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuthClient() });
}

module.exports = { getAuthClient, getSheetsClient, getDriveClient };
