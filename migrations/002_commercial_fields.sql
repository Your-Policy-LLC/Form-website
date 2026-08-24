-- Commercial-specific detail. Every column is nullable because these fields
-- only exist on submissions where Commercial was selected; a personal-lines
-- lead legitimately has none of them. Existing rows stay null, so no backfill
-- is needed or meaningful.

alter table submissions
  add column if not exists business_name   text,
  add column if not exists business_phone  text,
  add column if not exists business_email  text,
  add column if not exists business_zip    text,
  add column if not exists employee_range  text,
  -- Tri-state on purpose. Null means the question was never asked because the
  -- lead was not commercial; false means they were asked and declined. A plain
  -- boolean default would erase that distinction.
  add column if not exists eb_contact_ok   boolean;

-- Supports the obvious follow-up query: which commercial leads said yes to an
-- employee benefits conversation and have not been worked yet.
create index if not exists submissions_eb_interest_idx
  on submissions (created_at desc)
  where eb_contact_ok is true;
