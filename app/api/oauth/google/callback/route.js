import { verifyRelayState, signAuthCode, getIssuer } from '../../../../../lib/jwt';
import { exchangeGoogleCode } from '../../../../../lib/google-identity';

/**
 * GET /api/oauth/google/callback
 *
 * Google redirects here after the user logs in and approves. We:
 * 1. Recover the original Claude request from the relay state
 * 2. Exchange Google's code for an id_token, read the email out of it
 * 3. Check that email against ALLOWED_GOOGLE_EMAIL (single-user allow-list)
 * 4. Mint OUR OWN short-lived authorization code
 * 5. Redirect back to Claude's redirect_uri with that code
 *
 * Google's token is used and discarded right here - it never leaves this
 * function, and it's never the thing Claude ends up using as its MCP
 * bearer token.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const code = params.get('code');
  const state = params.get('state');
  const googleError = params.get('error');

  if (googleError) {
    return errorPage(`Google sign-in failed: ${googleError}`);
  }
  if (!code || !state) {
    return errorPage('Missing code or state from Google.');
  }

  let relay;
  try {
    relay = await verifyRelayState(state);
  } catch (err) {
    return errorPage('Invalid or expired authorization attempt. Please try connecting again from Claude.');
  }

  let email;
  try {
    const googleCallbackUri = `${getIssuer()}/api/oauth/google/callback`;
    const result = await exchangeGoogleCode({ code, redirectUri: googleCallbackUri });
    email = result.email;
  } catch (err) {
    return errorPage(`Could not verify your Google account: ${err.message}`);
  }

  const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL;
  if (!allowedEmail) {
    return errorPage('Server misconfiguration: ALLOWED_GOOGLE_EMAIL is not set.');
  }
  if (email.toLowerCase() !== allowedEmail.toLowerCase()) {
    return errorPage(
      `This connector is only authorized for one specific Google account. Signed in as ${email}, which isn't it.`
    );
  }

  // Identity confirmed - mint our own authorization code for Claude to redeem.
  const ourAuthCode = await signAuthCode({
    clientId: relay.clientId,
    redirectUri: relay.redirectUri,
    codeChallenge: relay.codeChallenge,
    resource: relay.resource,
    scope: relay.scope,
    email,
  });

  const redirectUrl = new URL(relay.redirectUri);
  redirectUrl.searchParams.set('code', ourAuthCode);
  if (relay.claudeState) {
    redirectUrl.searchParams.set('state', relay.claudeState);
  }

  return Response.redirect(redirectUrl.toString(), 302);
}

function errorPage(message) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 2rem;">
      <h2>Connection failed</h2>
      <p>${message}</p>
    </body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html' } }
  );
}
