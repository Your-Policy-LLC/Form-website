-- Precise employee count replaces the bucketed range. A range was easier to
-- collect but an employer knows their headcount, and "31-50" cannot answer
-- questions a number can.
--
-- employee_range is left in place rather than dropped: rows already carry range
-- values, and deleting the column would destroy them. New submissions populate
-- employee_count and leave employee_range null.

alter table submissions
  add column if not exists employee_count integer;
