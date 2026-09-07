/**
 * This is ONLY used to prove identity during our own /authorize flow -
 * "did a real human who owns ALLOWED_GOOGLE_EMAIL just log in?" It is
 * completely separate from src/auth.js, which handles the server's own
 * long-lived Drive/Sheets access via a refresh token. Two unrelated Google
 * OAuth interactions, sharing the same Cloud project's Client ID/Secret
 * (that's fine - one OAuth client can be used for multiple flows) but never
 * sharing tokens.
 *
 * Reuses the SAME Google Cloud OAuth Client as src/auth.js
 * (GOOGLE_OAUTH_CLIENT_ID/SECRET), but needs its OWN redirect URI added to
 * that client's "Authorized redirect URIs" in Google Cloud Console:
 *   {MCP_ISSUER_URL}/api/oauth/google/callback
 */

function buildGoogleAuthUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    access_type: 'online', // we don't need a Google refresh token here, just a one-time identity check
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode({ code, redirectUri }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${errText}`);
  }

  const tokens = await res.json();

  // id_token is a JWT; decode its payload to read the email claim.
  // We trust it here because it came directly from Google's token endpoint
  // over HTTPS (not from the client/browser), so there's no need to
  // re-verify Google's signature - this is the standard "server-side flow"
  // trust boundary.
  const payloadB64 = tokens.id_token.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

  if (!payload.email_verified) {
    throw new Error('Google account email is not verified.');
  }

  return { email: payload.email };
}

export { buildGoogleAuthUrl, exchangeGoogleCode };
