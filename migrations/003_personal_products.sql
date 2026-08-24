-- Which personal lines products the prospect wants quoted. Null for leads that
-- did not select Personal Insurance, empty never: validation requires at least
-- one product when the line is selected, so an empty array would mean a bug
-- rather than a legitimate answer.
--
-- Stored as an array rather than boolean columns per product so adding a
-- product later is a code change, not a migration.

alter table submissions
  add column if not exists personal_products text[];

-- Supports "which personal leads want flood" style questions without scanning
-- the table.
create index if not exists submissions_personal_products_idx
  on submissions using gin (personal_products);
