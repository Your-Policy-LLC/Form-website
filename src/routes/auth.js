import express from 'express';
import { randomBytes } from 'node:crypto';
import {
  ssoConfigured, newPkce, buildAuthorizeUrl, exchangeCode,
  verifyIdToken, emailFromClaims,
} from '../auth/entra.js';
import {
  issueSession, clearSession, issueTransaction, readTransaction, clearTransaction,
} from '../auth/session.js';
import { config } from '../config.js';

export const authRouter = express.Router();

authRouter.get('/login', async (req, res) => {
  if (!ssoConfigured()) {
    return res.status(503).type('text/plain').send('Admin sign-in is not configured.');
  }
  const state = randomBytes(16).toString('base64url');
  const { verifier, challenge } = newPkce();
  // Only internal paths. Without this check the returnTo parameter is an open
  // redirect: an attacker could send a login link that lands on their site.
  const raw = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/admin';
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/admin';

  await issueTransaction(res, { state, verifier, returnTo });
  res.redirect(buildAuthorizeUrl({ state, challenge }));
});

authRouter.get('/callback', async (req, res) => {
  const tx = await readTransaction(req);
  clearTransaction(res);

  if (!tx) return res.status(400).type('text/plain').send('Sign-in expired. Try again.');
  // Comparing the returned state to the one issued is what stops a login
  // response from another session being replayed into this browser.
  if (req.query.state !== tx.state) {
    console.warn('[auth] state mismatch on callback');
    return res.status(400).type('text/plain').send('Sign-in failed. Try again.');
  }
  if (typeof req.query.code !== 'string') {
    return res.status(400).type('text/plain').send('Sign-in failed. Try again.');
  }

  try {
    const tokens = await exchangeCode({ code: req.query.code, verifier: tx.verifier });
    const claims = await verifyIdToken(tokens.id_token);
    const email = emailFromClaims(claims);
    if (!email) throw new Error('no email claim');

    if (!config.adminAllowedEmails.includes(email)) {
      console.warn(`[auth] denied: ${email} not in ADMIN_ALLOWED_EMAILS`);
      return res.status(403).type('text/plain').send(`${email} is not an approved admin.`);
    }

    await issueSession(res, { email, name: claims.name || email });
    console.log(`[auth] signed in ${email}`);
    res.redirect(tx.returnTo || '/admin');
  } catch (err) {
    console.error(`[auth] callback failed: ${err.message}`);
    res.status(400).type('text/plain').send('Sign-in failed. Try again.');
  }
});

authRouter.get('/logout', (_req, res) => {
  clearSession(res);
  res.type('text/plain').send('Signed out.');
});
