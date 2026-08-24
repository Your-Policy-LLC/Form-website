import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config } from './config.js';
import { SITES, getSite, frameAncestorsFor } from './sites.js';
import { CONSENT } from './consent.js';
import { LINES_OF_BUSINESS, validateSubmission } from './validate.js';
import { buildMessage, deliver } from './slack.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const app = express();
// Railway terminates TLS upstream, so the client IP is only visible in
// X-Forwarded-For. Without this the rate limiter buckets every request in the
// world under the proxy's address.
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

// Read once at boot. The form is a static template with one substitution; there
// is no reason to hit the disk on every render.
const formTemplate = await readFile(join(publicDir, 'form.html'), 'utf8');
const embedScript = await readFile(join(publicDir, 'embed.js'), 'utf8');

// Best-effort rate limiting, deliberately in memory. A restart clears it, which
// is acceptable: this exists to blunt casual bot spam, not to be an access
// control. Anything stronger would need the durable store this project does not
// have, and that trade is not worth making for a public quote form.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// Unbounded maps are how small services leak. Sweep expired buckets hourly.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length) hits.set(ip, recent);
    else hits.delete(ip);
  }
}, 60 * 60 * 1000).unref();

// Liveness only, matching people-website's convention: 200 while the process is
// alive. Slack being unreachable is not a reason for Railway to restart us into
// a loop.
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    slack: config.slackDryRun ? 'dry-run' : 'configured',
    consentApproved: CONSENT.approved,
    sites: Object.keys(SITES).length,
  });
});

app.get('/embed.js', (_req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(embedScript);
});

// The iframe document. The CSP is built per slug, which is what actually
// enforces where this form may appear: a site not in allowedOrigins gets the
// header refusing to frame it, and the browser blanks the embed.
app.get('/f/:slug', (req, res) => {
  const site = getSite(req.params.slug);
  if (!site) {
    console.warn(`[form] unknown slug requested slug=${req.params.slug}`);
    return res.status(404).type('text/plain').send('Unknown form.');
  }

  const bootstrap = {
    slug: site.slug,
    lines: LINES_OF_BUSINESS,
    consentText: CONSENT.text,
    fallbackPhone: config.fallbackPhone,
  };

  res.set('Content-Security-Policy', frameAncestorsFor(site));
  // The legacy header understands no allowlist beyond a single origin, so it is
  // deliberately not set. Modern browsers use frame-ancestors above.
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.type('html');
  res.send(formTemplate.replace('"__BOOTSTRAP__"', JSON.stringify(bootstrap)));
});

app.post('/api/submit', async (req, res) => {
  const site = getSite(req.body?.slug);
  if (!site) {
    console.warn(`[submit] rejected: unknown slug=${req.body?.slug}`);
    return res.status(404).json({ ok: false, message: 'Unknown form.' });
  }

  if (rateLimited(req.ip)) {
    console.warn(`[submit] rejected: rate-limited slug=${site.slug}`);
    return res.status(429).json({ ok: false, message: 'Too many submissions. Please try again later.' });
  }

  // Honeypot: a field hidden from humans that bots fill in anyway. Returning
  // success is intentional. Telling a bot it failed teaches whoever wrote it to
  // adapt; telling it nothing happened costs us nothing.
  if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
    console.warn(`[submit] dropped: honeypot filled slug=${site.slug}`);
    return res.json({ ok: true });
  }

  const { ok, errors, value } = validateSubmission(req.body);
  if (!ok) {
    console.warn(`[submit] rejected: invalid slug=${site.slug} fields=${Object.keys(errors).join(',')}`);
    return res.status(400).json({ ok: false, errors });
  }

  const submission = {
    ...value,
    submittedAt: new Date().toISOString(),
    pageUrl: typeof req.body?.pageUrl === 'string' ? req.body.pageUrl.slice(0, 500) : '',
    utm: sanitiseUtm(req.body?.utm),
  };

  const result = await deliver(buildMessage(submission, site, CONSENT));

  if (!result.delivered) {
    // The prospect is told the truth. A thank-you here would mean the lead is
    // gone and nobody, including them, knows it.
    console.error(`[submit] NOT DELIVERED slug=${site.slug} reason=${result.reason}`);
    return res.status(502).json({ ok: false, undelivered: true });
  }

  console.log(`[submit] delivered slug=${site.slug} lines=${submission.lines.join('+')} zip=${submission.zip}`);
  return res.json({ ok: true });
});

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];

function sanitiseUtm(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of UTM_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 120);
  }
  return out;
}

app.use((_req, res) => res.status(404).type('text/plain').send('Not found.'));

app.listen(config.port, () => {
  console.log(`[boot] listening port=${config.port} env=${config.nodeEnv}`);
  console.log(`[boot] sites=${Object.keys(SITES).join(',')}`);
  console.log(`[boot] slack=${config.slackDryRun ? 'DRY-RUN (no token)' : `channel ${config.slackChannel}`}`);
  if (!CONSENT.approved) {
    console.warn('[boot] consent text is PLACEHOLDER and not compliance-approved');
  }
  console.log('[boot] ready');
});
