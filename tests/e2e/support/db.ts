/**
 * A single shared Postgres connection for e2e specs — mirrors the
 * `postgres(...)`/`drizzle(...)` pattern every seed script and unit test
 * already uses,
 * pointed at whatever `DATABASE_URL` the Playwright run itself uses (the
 * dedicated `bv_e2e` database — see playwright.config.ts's `webServer.env`
 * and this repo's README/task-64 report for why a separate DB from the
 * vitest suite's `bv_test`).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../../src/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set for the e2e suite. playwright.config.ts should set it before spawning ' +
      'the webServer and before test files import this module.',
  );
}

const client = postgres(DATABASE_URL, { max: 5 });
export const db = drizzle(client, { schema });
