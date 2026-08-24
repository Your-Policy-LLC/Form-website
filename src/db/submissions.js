import { query } from './pool.js';

// Returns the persisted row. The caller treats a successful return here as the
// point the lead is safe: the prospect's thank-you is owed to this commit, not
// to any downstream notification.
export async function insertSubmission(submission, site, consent) {
  const { rows } = await query(
    `insert into submissions
       (site_slug, lines, first_name, last_name, phone, email, zip,
        page_url, utm, consent_version, consent_text)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     returning id, created_at`,
    [
      site.slug,
      submission.lines,
      submission.firstName,
      submission.lastName,
      submission.phone,
      submission.email,
      submission.zip,
      submission.pageUrl || null,
      JSON.stringify(submission.utm || {}),
      consent.version,
      consent.text,
    ],
  );
  return rows[0];
}

// Called after a successful Slack post. Guarded on slack_notified_at being null
// so a retry that races the original write cannot produce a second post: the
// flag lives in Postgres, which survives the restarts an in-memory flag does
// not.
export async function markNotified(id, slackTs) {
  const { rowCount } = await query(
    `update submissions
        set slack_notified_at = now(), slack_ts = $2
      where id = $1 and slack_notified_at is null`,
    [id, slackTs],
  );
  return rowCount === 1;
}

export async function recordAttempt(id) {
  await query('update submissions set slack_attempts = slack_attempts + 1 where id = $1', [id]);
}
