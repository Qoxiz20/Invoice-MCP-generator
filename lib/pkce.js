import { createHash } from 'crypto';

/**
 * PKCE (RFC 7636), S256 method only - this is what Claude uses.
 * code_challenge = BASE64URL(SHA256(code_verifier))
 * At /token, Claude sends the original code_verifier; we recompute this
 * and compare it to the code_challenge we received (and stored inside the
 * signed auth-code JWT) back at /authorize.
 */
function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}

export { verifyPkce };
