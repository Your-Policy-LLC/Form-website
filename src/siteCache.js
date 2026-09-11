// Ties the database to the in-memory registry. Separate from sites.js so that
// module stays free of database imports, and separate from db/sites.js so that
// one stays a pure data layer. Both boot and the admin call this.

import { listSites, seedIfEmpty } from './db/sites.js';
import { loadCache } from './sites.js';

export async function refreshSites() {
  const rows = await listSites();
  return loadCache(rows);
}

export async function initSites() {
  await seedIfEmpty();
  return refreshSites();
}
