import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const tenantBase = () =>
  `https://login.microsoftonline.com/${config.entra.tenantId}`;

let jwks = null;
function keySet() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${tenantBase()}/discovery/v2.0/keys`)
    );
  }
  return jwks;
}

export function ssoConfigured() {
  const { tenantId, clientId, clientSecret } = config.entra;
  return Boolean(
    tenantId && clientId && clientSecret && config.sessionSecret && config.publicBaseUrl
  );
}

export const redirectUri = () => `${config.publicBaseUrl}/auth/callback`;

// PKCE. Entra supports it for confidential clients, and it costs nothing:
// even if an authorization code leaks from a redirect, it is unusable without
// the verifier that never left this server.
export function newPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl({ state, challenge }) {
  const url = new URL(`${tenantBase()}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', config.entra.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode({ code, verifier }) {
  const body = new URLSearchParams({
    client_id: config.entra.clientId,
    client_secret: config.entra.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    scope: 'openid profile email',
  });

  const res = await fetch(`${tenantBase()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`token exchange failed: ${json.error_description || json.error}`);
  }
  return json;
}

// Verifies signature, issuer, and audience against Entra's published keys.
// Skipping any of these would make the ID token a self-asserted claim.
export async function verifyIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, keySet(), {
    issuer: `${tenantBase()}/v2.0`,
    audience: config.entra.clientId,
  });
  return payload;
}

// Entra is inconsistent about which claim carries the address depending on
// account type, so check the usual three rather than assuming `email`.
export function emailFromClaims(claims) {
  const raw =
    claims.email ||
    claims.preferred_username ||
    (Array.isArray(claims.emails) ? claims.emails[0] : null);
  return raw ? String(raw).trim().toLowerCase() : null;
}
