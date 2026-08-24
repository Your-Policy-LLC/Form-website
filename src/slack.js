// Slack delivery. Slack is the system of record for leads on this project, so
// the failure behaviour matters more than the happy path: if the message does
// not land, nobody ever learns the lead existed. The route therefore waits on
// this function and only shows the prospect a thank-you once it resolves.

import { config } from './config.js';
import { labelFor, formatPhone } from './validate.js';

const SLACK_URL = 'https://slack.com/api/chat.postMessage';

// Slack returns HTTP 200 with { ok: false, error: '...' } for application-level
// failures, so status alone proves nothing. These errors are worth retrying;
// anything else (bad token, missing channel, not in channel) is a configuration
// problem that will fail identically on the next attempt, so we stop early
// rather than burning three attempts and delaying the prospect's page.
const RETRIABLE = new Set([
  'ratelimited',
  'service_unavailable',
  'internal_error',
  'fatal_error',
  'request_timeout',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildMessage(submission, site, consent) {
  const linesText = submission.lines.map(labelFor).join(', ');
  const headline = `New quote request: ${linesText}`;

  // Slack renders this in each viewer's own timezone. A raw UTC string would
  // make every producer do the conversion themselves on every lead.
  const epoch = Math.floor(new Date(submission.submittedAt).getTime() / 1000);
  const when = `<!date^${epoch}^{date_short_pretty} at {time}|${submission.submittedAt}>`;

  const contact = [];
  if (submission.phone) contact.push(`*Phone:* ${formatPhone(submission.phone)}`);
  if (submission.email) contact.push(`*Email:* ${submission.email}`);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: headline, emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Name:*\n${submission.firstName} ${submission.lastName}` },
        { type: 'mrkdwn', text: `*ZIP:*\n${submission.zip}` },
        { type: 'mrkdwn', text: `*Site:*\n${site.label}` },
        { type: 'mrkdwn', text: `*Submitted:*\n${when}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: contact.join('\n') } },
  ];

  // Commercial detail, only present when Commercial was selected. The employee
  // benefits answer is called out explicitly because it is the one field that
  // routes the lead to a second person.
  const c = submission.commercial;
  if (c && c.name) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Business:*\n${c.name}` },
        { type: 'mrkdwn', text: `*Employees:*\n${c.range || 'not given'}` },
        { type: 'mrkdwn', text: `*Business phone:*\n${formatPhone(c.phone)}` },
        { type: 'mrkdwn', text: `*Business email:*\n${c.email || 'not given'}` },
        { type: 'mrkdwn', text: `*Business ZIP:*\n${c.zip || 'not given'}` },
        { type: 'mrkdwn', text: `*Employee benefits contact:*\n${c.ebOk ? 'YES, wants a rep' : 'No'}` },
      ],
    });
  }

  const provenance = [`Page: ${submission.pageUrl || 'unknown'}`];
  if (submission.utm && Object.keys(submission.utm).length) {
    provenance.push(
      Object.entries(submission.utm)
        .map(([k, v]) => `${k}=${v}`)
        .join(' | '),
    );
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: provenance.join('\n') }],
  });

  // The consent record. Verbose on purpose: this message is the only place it
  // is written down.
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Consent (${consent.version}) shown and accepted: "${consent.text}"`,
      },
    ],
  });

  // Fallback text for notifications and screen readers, where blocks are not
  // rendered. Without it the push notification is blank.
  const text = `${headline} from ${site.label} (${submission.firstName} ${submission.lastName})`;

  return { text, blocks };
}

async function attempt(message) {
  const res = await fetch(SLACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${config.slackBotToken}`,
    },
    body: JSON.stringify({ channel: config.slackChannel, ...message }),
    signal: AbortSignal.timeout(8000),
  });

  const body = await res.json().catch(() => ({ ok: false, error: 'bad_json' }));
  return { httpStatus: res.status, ok: body.ok === true, error: body.error || null, ts: body.ts || null };
}

// Resolves { delivered, ts, reason }. Never throws: the caller needs a decision,
// not an exception, because what the prospect sees depends on the answer.
export async function deliver(message) {
  if (config.slackDryRun) {
    console.log('[slack] dry-run, no token configured. Payload follows:');
    console.log(JSON.stringify(message, null, 2));
    return { delivered: true, ts: null, reason: 'dry-run' };
  }

  const backoffMs = [0, 400, 1200];
  let lastReason = 'unknown';

  for (let i = 0; i < backoffMs.length; i += 1) {
    if (backoffMs[i]) await sleep(backoffMs[i]);

    try {
      const result = await attempt(message);

      if (result.ok) {
        console.log(`[slack] delivered attempt=${i + 1} ts=${result.ts}`);
        return { delivered: true, ts: result.ts, reason: 'ok' };
      }

      lastReason = result.error || `http_${result.httpStatus}`;
      const retriable = result.httpStatus >= 500 || RETRIABLE.has(lastReason);
      console.error(`[slack] attempt=${i + 1} failed reason=${lastReason} retriable=${retriable}`);
      if (!retriable) break;
    } catch (err) {
      lastReason = err.name === 'TimeoutError' ? 'timeout' : 'network_error';
      console.error(`[slack] attempt=${i + 1} failed reason=${lastReason}`);
    }
  }

  console.error(`[slack] gave up after retries reason=${lastReason}`);
  return { delivered: false, ts: null, reason: lastReason };
}
