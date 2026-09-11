import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

// The session is a signed JWT in a cookie rather than a server-side store.
// Entra proves identity once; this is what makes the result unforgeable on
// every subsequent request. Stateless by design — it survives restarts and
// needs no shared state if the service ever runs more than one replica.

const COOKIE = 'fw_session';
const TX_COOKIE = 'fw_tx';
const TTL_SECONDS = 8 * 60 * 60;

const secret = () => new TextEncoder().encode(config.sessionSecret || '');

const cookieOpts = (maxAgeMs) => ({
  httpOnly: true,
  secure: true,
  sameSite: 'lax', // must survive the redirect back from Microsoft
  path: '/',
  maxAge: maxAgeMs,
});

export async function issueSession(res, { email, name }) {
  const token = await new SignJWT({ email, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  res.cookie(COOKIE, token, cookieOpts(TTL_SECONDS * 1000));
}

export async function readSession(req) {
  const raw = req.cookies?.[COOKIE];
  if (!raw || !config.sessionSecret) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// The in-flight login also needs state: the CSRF `state` value and the PKCE
// verifier have to survive the round trip to Microsoft. Same trick, short TTL.
export async function issueTransaction(res, { state, verifier, returnTo }) {
  const token = await new SignJWT({ state, verifier, returnTo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret());
  res.cookie(TX_COOKIE, token, cookieOpts(10 * 60 * 1000));
}

export async function readTransaction(req) {
  const raw = req.cookies?.[TX_COOKIE];
  if (!raw || !config.sessionSecret) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return payload;
  } catch {
    return null;
  }
}

export function clearTransaction(res) {
  res.clearCookie(TX_COOKIE, { path: '/' });
}
