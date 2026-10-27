-- Site registry moves from code into the database so domains can be edited
-- without a deploy. The code entries in src/sites.js remain as the seed and as
-- documentation of the expected shape; they are inserted once, on first run
-- against an empty table, and never overwritten afterwards.
--
-- slug is the primary key rather than a surrogate id: it is already unique, it
-- is what appears in the embed snippet, and using it directly means a lead's
-- site_slug needs no join to be readable.

create table if not exists sites (
  slug            text primary key,
  label           text        not null,
  allowed_origins text[]      not null default '{}',
  -- Per-site colour overrides. Empty means inherit DEFAULT_THEME.
  theme           jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
);

-- Audit trail. Editing which domains may embed a lead form is a security
-- change, and moving it out of git means losing the review and revert that came
-- with a commit. This is the replacement: every write is recorded with who made
-- it and what the row looked like before.
create table if not exists site_changes (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text        not null,
  action     text        not null,
  slug       text        not null,
  before     jsonb,
  after      jsonb
);

create index if not exists site_changes_at_idx on site_changes (at desc);
