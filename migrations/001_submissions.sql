-- Lead submissions. This table is the system of record; Slack becomes a
-- notification layer over it rather than the record itself.
--
-- Retention is indefinite by decision, not by omission. created_at is indexed
-- so a purge horizon can be applied later as a single delete rather than a
-- migration.

create extension if not exists pgcrypto;

create table if not exists submissions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  site_slug         text        not null,
  lines             text[]      not null,

  first_name        text        not null,
  last_name         text        not null,
  phone             text,
  email             text,
  zip               text        not null,

  page_url          text,
  utm               jsonb       not null default '{}'::jsonb,

  -- The consent record, stored verbatim. A boolean would prove nothing later:
  -- nobody will remember what the checkbox said on the day it was accepted.
  consent_version   text        not null,
  consent_text      text        not null,

  -- Slack delivery state. slack_notified_at is the durable idempotency flag:
  -- it is what stops a restart or a retry sweep from double-posting a lead.
  slack_ts          text,
  slack_notified_at timestamptz,
  slack_attempts    integer     not null default 0
);

create index if not exists submissions_created_at_idx
  on submissions (created_at desc);

create index if not exists submissions_site_created_idx
  on submissions (site_slug, created_at desc);

-- Partial index for the future Slack sweep. It stays tiny because rows leave it
-- as soon as they are notified, so scanning for unnotified leads never degrades
-- as the table grows.
create index if not exists submissions_pending_slack_idx
  on submissions (created_at)
  where slack_notified_at is null;
