-- The mirror of eb_contact_ok. An Employee Benefits prospect is asked whether
-- we may also quote their business insurance; a Commercial prospect is asked
-- whether a benefits rep may reach out. Neither question is shown when both
-- lines are already selected, because there is nothing left to cross-sell.
--
-- Tri-state, same reasoning as eb_contact_ok: null means the question was never
-- put to them, false means they were asked and declined. Collapsing those makes
-- "how many declined" unanswerable.

alter table submissions
  add column if not exists commercial_quote_ok boolean;

create index if not exists submissions_commercial_interest_idx
  on submissions (created_at desc)
  where commercial_quote_ok is true;
