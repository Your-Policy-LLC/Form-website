// Ties the database to the in-memory registry. Separate from sites.js so that
// module stays free of database imports, and separate from db/sites.js so that
// one stays a pure data layer. Both boot and the admin call this.

import { listSites, seedIfEmpty } from './db/sites.js';
import { loadCache, SEED_SITES } from './sites.js';

export async function refreshSites() {
  const rows = await listSites();
  return loadCache(rows);
}

export async function initSites() {
  await seedIfEmpty();
  return refreshSites();
}

// Used when the database is unreachable at boot. Before the registry moved to
// Postgres a database outage only disabled submissions; without this it would
// also empty the cache, and every embedded form on every client site would 404.
// The code list is the same one the table was seeded from, so the forms keep
// rendering with their last known domains until the next successful boot.
export function loadSeedFallback() {
  const rows = Object.entries(SEED_SITES).map(([slug, s]) => ({
    slug,
    label: s.label,
    allowed_origins: s.allowedOrigins,
    theme: s.theme || {},
  }));
  const n = loadCache(rows);
  console.warn(`[sites] FALLBACK: loaded ${n} sites from code because the database was unavailable`);
  return n;
}
