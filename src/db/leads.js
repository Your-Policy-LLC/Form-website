import { query } from './pool.js';

// Read-only queries behind the leads dashboard. Nothing here writes, so the
// dashboard can never change a lead; the submissions table stays the record.

// Dates arrive as YYYY-MM-DD and mean whole days in the agency's time zone, not
// UTC. Without this a lead submitted at 8pm Central lands on "tomorrow".
export const REPORT_TZ = 'America/Chicago';

// The preview slug exists so test runs are never mistaken for agency leads. It
// is excluded unless asked for, which is what makes that promise hold here too.
export const TEST_SLUG = 'preview';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function ids(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((s) => String(s).trim().toLowerCase()).filter((s) => ID_RE.test(s));
}

// Pure so it can be tested without a database. Every value goes in as a bind
// parameter; nothing from the query string is ever interpolated into SQL.
export function buildFilter(q = {}) {
  const where = [];
  const params = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (DATE_RE.test(q.from || '')) {
    where.push(`created_at >= (${p(q.from)}::date)::timestamp at time zone '${REPORT_TZ}'`);
  }
  if (DATE_RE.test(q.to || '')) {
    // Inclusive of the whole "to" day.
    where.push(`created_at < ((${p(q.to)}::date + 1))::timestamp at time zone '${REPORT_TZ}'`);
  }

  const sites = ids(q.site);
  if (sites.length) where.push(`site_slug = any(${p(sites)}::text[])`);
  else if (q.includeTest !== '1') where.push(`site_slug <> ${p(TEST_SLUG)}`);

  // Overlap, not containment: filtering on Personal means "asked for Personal",
  // including leads that also asked for something else.
  const lines = ids(q.line);
  if (lines.length) where.push(`lines && ${p(lines)}::text[]`);

  const products = ids(q.product);
  if (products.length) where.push(`personal_products && ${p(products)}::text[]`);

  return { sql: where.length ? `where ${where.join(' and ')}` : '', params };
}

export async function leadSummary(q) {
  const f = buildFilter(q);

  const [total, byOffice, byOfficeLine, combos, products, crossSell, sources] = await Promise.all([
    query(`select count(*)::int as n from submissions ${f.sql}`, f.params),

    query(
      `select site_slug, count(*)::int as n from submissions ${f.sql}
        group by site_slug`,
      f.params,
    ),

    // A lead asking for two lines counts once in each. The office total above
    // is the distinct count, so the two never get confused.
    query(
      `select site_slug, line, count(*)::int as n
         from submissions, unnest(lines) as line ${f.sql}
        group by site_slug, line`,
      f.params,
    ),

    // The exact set of personal products per lead, sorted so {auto,home} and
    // {home,auto} are the same combination.
    query(
      `select coalesce((select array_agg(x order by x) from unnest(personal_products) x), '{}') as combo,
              count(*)::int as n
         from submissions ${f.sql ? `${f.sql} and` : 'where'} 'personal' = any(lines)
        group by 1 order by 2 desc`,
      f.params,
    ),

    query(
      `select product, count(*)::int as n
         from submissions, unnest(personal_products) as product ${f.sql}
        group by product order by 2 desc`,
      f.params,
    ),

    query(
      `select count(*) filter (where eb_contact_ok is true)::int        as eb_interest,
              count(*) filter (where commercial_quote_ok is true)::int  as commercial_interest
         from submissions ${f.sql}`,
      f.params,
    ),

    // Where the lead came from: the campaign tag when there is one, otherwise
    // the page it was submitted on.
    query(
      `select coalesce(nullif(utm->>'utm_source', ''), '(no campaign tag)') as source,
              count(*)::int as n
         from submissions ${f.sql}
        group by 1 order by 2 desc limit 15`,
      f.params,
    ),
  ]);

  return {
    total: total.rows[0].n,
    byOffice: byOffice.rows,
    byOfficeLine: byOfficeLine.rows,
    personalCombos: combos.rows,
    personalProducts: products.rows,
    crossSell: crossSell.rows[0],
    sources: sources.rows,
  };
}

export const PAGE_SIZE = 50;

export async function leadList(q) {
  const f = buildFilter(q);
  const offset = Math.max(0, Math.min(100000, parseInt(q.offset, 10) || 0));
  const { rows } = await query(
    `select id, created_at, site_slug, lines, personal_products,
            first_name, last_name, phone, email, zip,
            business_name, employee_count, eb_contact_ok, commercial_quote_ok,
            marine, page_url, utm, slack_notified_at
       from submissions ${f.sql}
      order by created_at desc
      limit ${PAGE_SIZE + 1} offset ${offset}`,
    f.params,
  );
  return { leads: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, offset };
}
