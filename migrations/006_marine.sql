-- Marine details for the Boat & Marine line, currently offered only by
-- general-insurance-dallas (see sites.js). Null for every other lead and for
-- GIA leads that did not select the line.
--
-- Stored as one jsonb column rather than three text columns because the set of
-- questions is expected to grow (length, value, storage were discussed and
-- deferred). Adding a key is then a form change, not a migration. Shape today:
--   { "year": 2021, "makeModel": "Malibu 23 LSV", "lake": "possum-kingdom" }
-- `lake` is an id from LAKES in validate.js, not a display label.

alter table submissions
  add column if not exists marine jsonb;
