import { verifyAuthCode, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../lib/jwt';
import { verifyPkce } from '../../../lib/pkce';

/**
 * POST /api/token
 *
 * Standard OAuth 2.1 token endpoint. Supports two grant types:
 * - authorization_code: the main flow, redeems the code from /authorize
 * - refresh_token: lets Claude get a new access token without a full
 *   Google re-login every time the 1-hour access token expires
 *
 * This is the ONE place that mints the access token whose `aud` claim is
 * our own canonical resource URL - satisfying RFC 8707, which Google's
 * OAuth server cannot do on its own.
 */
export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries());
  }

  const grantType = body.grant_type;

  // Confidential client check - required on every /token call, per how we
  // configured this in Claude's "Use your own OAuth client" field.
  if (body.client_id !== process.env.MCP_CLIENT_ID || body.client_secret !== process.env.MCP_CLIENT_SECRET) {
    return oauthError('invalid_client', 'Client authentication failed.', 401);
  }

  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(body);
  }
  if (grantType === 'refresh_token') {
    return handleRefreshToken(body);
  }
  return oauthError('unsupported_grant_type', `grant_type "${grantType}" is not supported.`, 400);
}

async function handleAuthorizationCode(body) {
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: clientId } = body;

  if (!code) return oauthError('invalid_request', 'Missing code.', 400);

  let payload;
  try {
    payload = await verifyAuthCode(code);
  } catch (err) {
    return oauthError('invalid_grant', 'Authorization code is invalid or expired.', 400);
  }

  if (payload.client_id !== clientId) {
    return oauthError('invalid_grant', 'client_id does not match the one used at /authorize.', 400);
  }
  if (payload.redirect_uri !== redirectUri) {
    return oauthError('invalid_grant', 'redirect_uri does not match the one used at /authorize.', 400);
  }
  if (!verifyPkce(codeVerifier, payload.code_challenge)) {
    return oauthError('invalid_grant', 'PKCE verification failed.', 400);
  }

  const accessToken = await signAccessToken({ email: payload.email, scope: payload.scope });
  const refreshToken = await signRefreshToken({ email: payload.email, scope: payload.scope });

  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: payload.scope,
  });
}

async function handleRefreshToken(body) {
  const { refresh_token: refreshToken } = body;
  if (!refreshToken) return oauthError('invalid_request', 'Missing refresh_token.', 400);

  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch (err) {
    return oauthError('invalid_grant', 'Refresh token is invalid or expired.', 400);
  }

  // Re-check the allow-list on every refresh too, not just at initial login -
  // if you ever change ALLOWED_GOOGLE_EMAIL, old refresh tokens for the
  // previous email stop working on their next refresh.
  const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL;
  if (payload.sub.toLowerCase() !== allowedEmail.toLowerCase()) {
    return oauthError('invalid_grant', 'This account is no longer authorized.', 400);
  }

  const accessToken = await signAccessToken({ email: payload.sub, scope: payload.scope });
  // Rotate the refresh token too - standard practice, and free since we're stateless anyway.
  const newRefreshToken = await signRefreshToken({ email: payload.sub, scope: payload.scope });

  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: newRefreshToken,
    scope: payload.scope,
  });
}

function oauthError(error, description, status) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
