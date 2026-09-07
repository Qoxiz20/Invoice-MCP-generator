import { SignJWT, jwtVerify } from 'jose';

/**
 * All tokens this Authorization Server issues (auth codes, access tokens,
 * refresh tokens) are signed JWTs using this one shared secret (HS256).
 * This is intentionally stateless - no database, no KV store. The trade-off:
 * revoking a single token isn't possible, only rotating MCP_JWT_SECRET
 * invalidates everything at once. Acceptable for a single-user connector;
 * would need a real token store to support per-token revocation.
 */
function getSecretKey() {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'MCP_JWT_SECRET is missing or too short. Set it to a long random string (32+ chars) in your environment variables.'
    );
  }
  return new TextEncoder().encode(secret);
}

function getIssuer() {
  const issuer = process.env.MCP_ISSUER_URL;
  if (!issuer) {
    throw new Error('MCP_ISSUER_URL is missing. Set it to your deployed app\'s canonical URL, e.g. https://your-app.vercel.app');
  }
  return issuer.replace(/\/$/, ''); // strip trailing slash, keep canonical
}

function getResourceUrl() {
  return `${getIssuer()}/api/mcp`;
}

/**
 * Our own "authorization code" - a short-lived signed JWT carrying everything
 * needed to complete the token exchange, instead of a database row. 60s
 * expiry. Not cryptographically single-use (no replay-tracking store) -
 * acceptable given the short window and single-user scope; harden with a KV
 * store later if ever needed.
 */
async function signAuthCode({ clientId, redirectUri, codeChallenge, resource, scope, email }) {
  return new SignJWT({
    type: 'auth_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    resource,
    scope,
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(getSecretKey());
}

async function verifyAuthCode(code) {
  const { payload } = await jwtVerify(code, getSecretKey(), { issuer: getIssuer() });
  if (payload.type !== 'auth_code') {
    throw new Error('Not an authorization code token.');
  }
  return payload;
}

/**
 * Access token - what Claude actually sends as the MCP Bearer token.
 * aud is the canonical resource URL (RFC 8707) - this is the piece Google
 * could never provide, which is why we mint it ourselves.
 */
async function signAccessToken({ email, scope }) {
  return new SignJWT({ type: 'access_token', scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(getIssuer())
    .setSubject(email)
    .setAudience(getResourceUrl())
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecretKey());
}

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    issuer: getIssuer(),
    audience: getResourceUrl(),
  });
  if (payload.type !== 'access_token') {
    throw new Error('Not an access token.');
  }
  return payload;
}

/**
 * Refresh token - longer-lived, lets Claude get a new access token without
 * re-running the full Google login every hour. Also stateless/self-contained.
 */
async function signRefreshToken({ email, scope }) {
  return new SignJWT({ type: 'refresh_token', scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(getIssuer())
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecretKey());
}

async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, getSecretKey(), { issuer: getIssuer() });
  if (payload.type !== 'refresh_token') {
    throw new Error('Not a refresh token.');
  }
  return payload;
}

/**
 * Relay state - carries the ORIGINAL Claude /authorize request params
 * (client_id, redirect_uri, code_challenge, resource, scope, Claude's own
 * state) through the round-trip to Google and back. Passed as Google's
 * own `state` parameter, which Google echoes back verbatim on callback -
 * this avoids needing any server-side session storage between the two
 * legs of the flow.
 */
async function signRelayState(claudeRequestParams) {
  return new SignJWT({ type: 'relay_state', ...claudeRequestParams })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime('10m') // generous - covers a slow human clicking through Google's consent screen
    .sign(getSecretKey());
}

async function verifyRelayState(state) {
  const { payload } = await jwtVerify(state, getSecretKey(), { issuer: getIssuer() });
  if (payload.type !== 'relay_state') {
    throw new Error('Not a relay state token.');
  }
  return payload;
}

export {
  getIssuer,
  getResourceUrl,
  signAuthCode,
  verifyAuthCode,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signRelayState,
  verifyRelayState,
};
