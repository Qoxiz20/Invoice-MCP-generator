import { signRelayState } from '../../../lib/jwt';
import { buildGoogleAuthUrl } from '../../../lib/google-identity';
import { getIssuer } from '../../../lib/jwt';

/**
 * GET /api/authorize
 *
 * Claude sends the user's browser here first, per standard OAuth 2.1
 * Authorization Code + PKCE. We don't show our own login form - we
 * immediately redirect to Google, using Google purely to confirm identity.
 * Once Google confirms it's really you, /api/oauth/google/callback takes
 * over and mints OUR OWN authorization code.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const resource = params.get('resource');
  const scope = params.get('scope') || 'mcp:tools';
  const claudeState = params.get('state');

  // Basic request validation - fail loudly and clearly rather than silently
  // redirecting somewhere wrong.
  if (responseType !== 'code') {
    return errorResponse('unsupported_response_type', 'Only response_type=code is supported.');
  }
  if (clientId !== process.env.MCP_CLIENT_ID) {
    return errorResponse('unauthorized_client', 'Unknown client_id.');
  }
  if (!redirectUri) {
    return errorResponse('invalid_request', 'Missing redirect_uri.');
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return errorResponse('invalid_request', 'PKCE with S256 is required.');
  }

  // Carry all of this through the Google round-trip via a signed relay state.
  const relayState = await signRelayState({
    clientId,
    redirectUri,
    codeChallenge,
    resource: resource || `${getIssuer()}/api/mcp`,
    scope,
    claudeState,
  });


console.log('GOOGLE_OAUTH_CLIENT_ID present:', !!process.env.GOOGLE_OAUTH_CLIENT_ID);
console.log('GOOGLE_OAUTH_CLIENT_ID prefix:', process.env.GOOGLE_OAUTH_CLIENT_ID);
console.log('GOOGLE_OAUTH_CLIENT_SECRET present:', !!process.env.GOOGLE_OAUTH_CLIENT_SECRET);


  const googleCallbackUri = `${getIssuer()}/api/oauth/google/callback`;
  const googleAuthUrl = buildGoogleAuthUrl({ state: relayState, redirectUri: googleCallbackUri });



  return Response.redirect(googleAuthUrl, 302);
}

function errorResponse(error, description) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
