import pg from 'pg';
import { config } from '../config.js';

// Railway's internal hostnames resolve inside the project and do not present a
// publicly-trusted certificate. The public proxy does. Enabling SSL without
// verification for the proxy case keeps local work against the real database
// possible; internal connections skip it entirely.
const isInternal = /\.railway\.internal/.test(config.databaseUrl || '');

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isInternal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => {
  // An idle client erroring is not fatal; the pool replaces it. Logged so a
  // recurring connection problem is visible rather than silent.
  console.error(`[db] idle client error: ${err.message}`);
});

export function query(text, params) {
  return pool.query(text, params);
}
