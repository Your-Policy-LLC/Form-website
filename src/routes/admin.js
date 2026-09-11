import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listSites, upsertSite, deleteSite } from '../db/sites.js';
import { refreshSites } from '../siteCache.js';
import { DEFAULT_THEME } from '../sites.js';

const here = dirname(fileURLToPath(import.meta.url));
export const adminRouter = express.Router();

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Validation lives here rather than in the browser because this endpoint is
// reachable directly, and because a bad origin does not fail loudly: it makes
// the form render blank on a client site, which nobody notices for days.
function validateSite(body) {
  const errors = {};
  const slug = String(body?.slug || '').trim().toLowerCase();
  const label = String(body?.label || '').trim();

  if (!SLUG_RE.test(slug)) {
    errors.slug = 'Lowercase letters, numbers and single hyphens only.';
  }
  if (!label) errors.label = 'Label is required.';
  if (label.length > 120) errors.label = 'Label is too long.';

  // Accepts a textarea: one per line, or comma separated. Each is normalised
  // through the URL parser so "example.com", a trailing slash, or a pasted full
  // page URL all resolve to the origin the browser will actually send.
  const rawOrigins = String(body?.allowedOrigins || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOrigins = [];
  const badOrigins = [];
  for (const entry of rawOrigins) {
    const candidate = /^https?:\/\//i.test(entry) ? entry : `https://${entry}`;
    try {
      const { origin, protocol } = new URL(candidate);
      if (protocol !== 'https:' && protocol !== 'http:') throw new Error('scheme');
      if (!allowedOrigins.includes(origin)) allowedOrigins.push(origin);
    } catch {
      badOrigins.push(entry);
    }
  }
  if (badOrigins.length) {
    errors.allowedOrigins = `Could not read: ${badOrigins.join(', ')}`;
  }

  // Only hex colours, and only keys the theme actually uses. This value is
  // injected into a <style> block, so anything else is an injection point.
  const theme = {};
  const badTheme = [];
  for (const [key, value] of Object.entries(body?.theme || {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_THEME, key)) continue;
    const v = String(value || '').trim();
    if (!v) continue;
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) theme[key] = v;
    else badTheme.push(key);
  }
  if (badTheme.length) errors.theme = `Not a hex colour: ${badTheme.join(', ')}`;

  return { ok: Object.keys(errors).length === 0, errors, value: { slug, label, allowedOrigins, theme } };
}

adminRouter.get('/', async (_req, res) => {
  res.type('html').send(await readFile(join(here, '..', 'views', 'admin.html'), 'utf8'));
});

adminRouter.get('/api/sites', async (_req, res) => {
  const rows = await listSites();
  res.json({ sites: rows, themeKeys: Object.keys(DEFAULT_THEME), defaultTheme: DEFAULT_THEME });
});

adminRouter.post('/api/sites', async (req, res) => {
  const { ok, errors, value } = validateSite(req.body);
  if (!ok) return res.status(400).json({ ok: false, errors });

  const saved = await upsertSite(value, req.user.email);
  // Refresh immediately. The cache is what every form render reads, so without
  // this the change would not take effect until the next restart.
  const count = await refreshSites();
  console.log(`[admin] ${req.user.email} saved slug=${value.slug} origins=${value.allowedOrigins.length} cache=${count}`);
  res.json({ ok: true, site: saved });
});

adminRouter.delete('/api/sites/:slug', async (req, res) => {
  const removed = await deleteSite(req.params.slug, req.user.email);
  if (!removed) return res.status(404).json({ ok: false, error: 'not found' });
  const count = await refreshSites();
  console.warn(`[admin] ${req.user.email} DELETED slug=${req.params.slug} cache=${count}`);
  res.json({ ok: true });
});
