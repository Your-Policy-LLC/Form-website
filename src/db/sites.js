import { query } from './pool.js';
import { SEED_SITES } from '../sites.js';

export async function listSites() {
  const { rows } = await query(
    `select slug, label, allowed_origins, theme, updated_at, updated_by
       from sites order by slug`,
  );
  return rows;
}

// Runs at boot. Only populates an empty table, so a deploy can never overwrite
// domains someone edited in the admin with stale values from the code.
export async function seedIfEmpty() {
  const { rows } = await query('select count(*)::int as n from sites');
  if (rows[0].n > 0) {
    console.log(`[sites] seed skipped: ${rows[0].n} already present`);
    return 0;
  }
  let inserted = 0;
  for (const [slug, site] of Object.entries(SEED_SITES)) {
    await query(
      `insert into sites (slug, label, allowed_origins, theme, updated_by)
       values ($1,$2,$3,$4::jsonb,'seed') on conflict (slug) do nothing`,
      [slug, site.label, site.allowedOrigins, JSON.stringify(site.theme || {})],
    );
    inserted += 1;
  }
  console.log(`[sites] seeded ${inserted} sites from code`);
  return inserted;
}

async function recordChange(actor, action, slug, before, after) {
  await query(
    `insert into site_changes (actor, action, slug, before, after)
     values ($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [actor, action, slug, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  );
}

async function getRow(slug) {
  const { rows } = await query(
    'select slug, label, allowed_origins, theme from sites where slug = $1',
    [slug],
  );
  return rows[0] || null;
}

export async function upsertSite({ slug, label, allowedOrigins, theme }, actor) {
  const before = await getRow(slug);
  const { rows } = await query(
    `insert into sites (slug, label, allowed_origins, theme, updated_by)
     values ($1,$2,$3,$4::jsonb,$5)
     on conflict (slug) do update
       set label = excluded.label,
           allowed_origins = excluded.allowed_origins,
           theme = excluded.theme,
           updated_at = now(),
           updated_by = excluded.updated_by
     returning slug, label, allowed_origins, theme`,
    [slug, label, allowedOrigins, JSON.stringify(theme || {}), actor],
  );
  await recordChange(actor, before ? 'update' : 'create', slug, before, rows[0]);
  return rows[0];
}

export async function deleteSite(slug, actor) {
  const before = await getRow(slug);
  if (!before) return false;
  await query('delete from sites where slug = $1', [slug]);
  await recordChange(actor, 'delete', slug, before, null);
  return true;
}
