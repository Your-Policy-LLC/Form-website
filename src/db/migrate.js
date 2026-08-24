// Migrations run at boot, before the server accepts traffic. The set is small
// and the statements are guarded with IF NOT EXISTS, so re-running is a no-op
// and a redeploy never needs manual intervention.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

export async function migrate() {
  await query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await query('select filename from schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await query(sql);
    await query('insert into schema_migrations (filename) values ($1)', [file]);
    console.log(`[migrate] applied ${file}`);
    ran += 1;
  }

  console.log(`[migrate] complete found=${files.length} applied=${ran} skipped=${files.length - ran}`);
}
