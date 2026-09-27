import { getIssuer } from '../../../lib/jwt';

/**
 * RFC 8414 - describes OUR OWN authorization server (not Google's).
 * Claude fetches this after discovering us via the protected resource
 * metadata, to learn where /authorize and /token live and what we support.
 */
export async function GET() {
  const issuer = getIssuer();

  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/api/authorize`,
    token_endpoint: `${issuer}/api/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    scopes_supported: ['mcp:tools'],
  };

  return Response.json(metadata, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
