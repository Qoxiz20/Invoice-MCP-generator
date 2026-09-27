require('dotenv').config();
const http = require('http');
const { google } = require('googleapis');

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env.');
  process.exit(1);
}

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`Google OAuth error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received.');
    return;
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.writeHead(400);
      res.end('No refresh token returned.');
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h2>Google authorization successful!</h2>
      <p>You can close this tab and return to CMD.</p>
    `);

    console.log('\n========================================');
    console.log('SUCCESS — NEW REFRESH TOKEN');
    console.log('========================================\n');
    console.log(tokens.refresh_token);
    console.log('\nCopy this token into Vercel as:');
    console.log('GOOGLE_OAUTH_REFRESH_TOKEN');
    console.log('\nDO NOT paste the token into ChatGPT.');

    server.close();
  } catch (err) {
    console.error('\nGoogle token exchange failed:');
    console.error(err.response?.data || err.message);

    res.writeHead(500);
    res.end('Token exchange failed. Check CMD.');

    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n========================================');
  console.log('Google OAuth Refresh Token Setup');
  console.log('========================================\n');
  console.log('Listening on:');
  console.log(REDIRECT_URI);
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nKeep this CMD window OPEN.');
  console.log('Waiting for Google authorization...\n');
});
