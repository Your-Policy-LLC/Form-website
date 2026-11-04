-- Per-site example text for the phone and ZIP fields. Before this the form
-- showed (512) 123-4567 and 77056, Austin and Houston, on every agency's site.
-- Null means "use the neutral default", so a new site never shows another
-- state's numbers.
alter table sites
  add column if not exists example_phone text,
  add column if not exists example_zip   text;

-- Backfill the sites that were live when this shipped. Guarded on null so a
-- re-run, or a value someone already set in the admin, is left alone. Numbers
-- use 555-01xx, the range reserved for fiction, so the example is never a real
-- line. ZIPs are each office's own.
update sites set example_phone = v.phone, example_zip = v.zip
  from (values
    ('insure-mt',                '(406) 555-0123', '59714'),
    ('larsen-flynn',             '(503) 555-0123', '97381'),
    ('sav-on',                   '(206) 555-0123', '98198'),
    ('general-insurance-dallas', '(214) 555-0123', '75247'),
    ('blueridge',                '(434) 555-0123', '24551')
  ) as v(slug, phone, zip)
 where sites.slug = v.slug
   and sites.example_phone is null
   and sites.example_zip is null;
