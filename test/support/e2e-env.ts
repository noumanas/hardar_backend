import { userInfo } from 'node:os';

import { TEST_ENV } from './test-config.js';

/**
 * Runs before every e2e file: points the app at the `haqdar_test` database and sets
 * known secrets. Override the database with TEST_DATABASE_URL (e.g. in CI).
 */
const env: Record<string, string | undefined> = {
  ...Object.fromEntries(
    Object.entries(TEST_ENV).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
  ),
  CORS_ORIGINS: '',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://${userInfo().username}@localhost:5432/haqdar_test`,
};

for (const [key, value] of Object.entries(env)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
