import 'reflect-metadata';

import { existsSync } from 'node:fs';

import { DataSource } from 'typeorm';

import { validateEnv } from '../config/env.schema.js';
import { buildDataSourceOptions } from './typeorm.options.js';

/** Data source for the TypeORM CLI (`pnpm migration:*`), run against the compiled build. */
if (existsSync('.env')) process.loadEnvFile('.env');

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
