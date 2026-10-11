import type { DataSourceOptions } from 'typeorm';

import type { Env } from '../config/env.schema.js';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

type DatabaseEnv = Pick<Env, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_LOGGING'>;

/** Shared by the Nest app and the TypeORM CLI data source, so both see the same schema. */
export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    logging: env.DATABASE_LOGGING,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    namingStrategy: new SnakeNamingStrategy(),
    // gen_random_uuid() is built into Postgres 13+, so no extension needs installing.
    uuidExtension: 'pgcrypto',
    // The schema only ever changes through reviewed migrations.
    synchronize: false,
  };
}
