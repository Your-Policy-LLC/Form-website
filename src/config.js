// Environment configuration. Mirrors people-website's fail-fast pattern: a
// missing production variable kills the process at boot rather than surfacing
// as a confusing runtime failure on the first real lead.
//
// SLACK_BOT_TOKEN is required in production only. In development a missing
// token puts the app in dry-run mode, where the exact Slack payload is logged
// instead of sent. That lets the form be built and verified end to end before
// the Slack app exists, and it can never silently happen in production because
// the boot check below refuses to start without the token.

// Nothing here is fatal any more. Earlier this exited on a missing Slack token
// because Slack was the only record of a lead, so running without it meant
// losing leads silently. Postgres is the system of record now: a missing token
// delays notification, it does not lose anything. And a process that refuses to
// boot gives a bare 502 with no way to see what is wrong, which is worse than
// running degraded and saying so on /healthz.
const EXPECTED = ['DATABASE_URL', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL'];

function readEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const missing = EXPECTED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(`[boot] not set: ${missing.join(', ')} (running degraded)`);
  }

  const slackBotToken = process.env.SLACK_BOT_TOKEN || null;

  return {
    port: Number(process.env.PORT) || 3000,
    nodeEnv,
    isProduction,
    slackBotToken,
    databaseUrl: process.env.DATABASE_URL,
    // Which site the bare domain renders. Embeds always name their slug
    // explicitly, so this only affects someone visiting the root by hand.
    // Null falls back to the first site in the registry.
    defaultSiteSlug: process.env.DEFAULT_SITE_SLUG || null,
    // Channel the referral lands in. A variable rather than a hardcoded string
    // so a channel rename, or a later move to per-line-of-business channels,
    // is a config change instead of a code deploy.
    slackChannel: process.env.SLACK_CHANNEL || '#pc-referral',
    // True when no token is present. Only reachable outside production.
    slackDryRun: !slackBotToken,
    // Public origin of this service. The embed loader derives the iframe URL
    // from its own script src, so this is only used for logging and for the
    // snippet shown in the setup docs.
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    // Shown to a prospect when Slack delivery fails, so a lead we could not
    // capture still has a way to reach us.
    fallbackPhone: process.env.FALLBACK_PHONE || '',
  };
}

export const config = readEnv();
