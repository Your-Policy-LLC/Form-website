import { config } from '../config.js';
import { ssoConfigured } from './entra.js';
import { readSession } from './session.js';

// Guards the admin only. people-website gates everything by default because
// almost all of its surface is private; here the opposite is true. The form,
// the loader and the submit endpoint are public by design and always will be,
// so a default-deny list of exemptions would be five chances to break a client
// site to protect one route. This guard is applied explicitly where it belongs.
export async function requireAdmin(req, res, next) {
  if (!ssoConfigured()) {
    // Fail closed. A half-configured sign-in must not leave the admin open.
    return res.status(503).type('text/plain').send('Admin sign-in is not configured.');
  }

  const session = await readSession(req);
  if (session && config.adminAllowedEmails.includes(session.email)) {
    req.user = session;
    return next();
  }

  if (session) {
    // Signed in to Microsoft but not on the list. Saying so beats an endless
    // redirect loop back to a provider that will keep succeeding.
    console.warn(`[auth] denied: ${session.email} not in ADMIN_ALLOWED_EMAILS`);
    return res.status(403).type('text/plain').send(`${session.email} is not an approved admin.`);
  }

  const wantsHtml = (req.get('accept') || '').includes('text/html');
  if (wantsHtml && req.method === 'GET') {
    return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(401).json({ error: 'unauthorized' });
}
