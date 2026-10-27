import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilter } from '../src/db/leads.js';

test('excludes the preview slug by default', () => {
  const f = buildFilter({});
  assert.match(f.sql, /site_slug <> \$1/);
  assert.deepEqual(f.params, ['preview']);
});

test('includeTest drops the preview exclusion', () => {
  assert.equal(buildFilter({ includeTest: '1' }).sql, '');
});

test('an explicit office replaces the preview exclusion', () => {
  const f = buildFilter({ site: 'insure-mt' });
  assert.match(f.sql, /site_slug = any\(\$1::text\[\]\)/);
  assert.deepEqual(f.params, [['insure-mt']]);
});

test('dates are bound, Central time, and "to" is inclusive', () => {
  const f = buildFilter({ from: '2026-10-01', to: '2026-10-26', includeTest: '1' });
  assert.match(f.sql, /America\/Chicago/);
  assert.match(f.sql, /\$2::date \+ 1/);
  assert.deepEqual(f.params, ['2026-10-01', '2026-10-26']);
});

test('nothing from the query string reaches the SQL text', () => {
  const evil = "x'; drop table submissions; --";
  const f = buildFilter({ from: evil, to: evil, site: evil, line: evil, product: evil });
  assert.doesNotMatch(f.sql, /drop table/);
  assert.ok(f.params.every((p) => !String(p).includes('drop')));
});

test('line and product filters use overlap', () => {
  const f = buildFilter({ line: 'personal', product: 'home,auto', includeTest: '1' });
  assert.match(f.sql, /lines && \$1::text\[\]/);
  assert.match(f.sql, /personal_products && \$2::text\[\]/);
  assert.deepEqual(f.params, [['personal'], ['home', 'auto']]);
});
