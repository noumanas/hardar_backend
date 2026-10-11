import type { MigrationInterface } from 'typeorm';

import { InitialSchema1791460800000 } from './1791460800000-InitialSchema.js';
import { AddConversationReview1791504000000 } from './1791504000000-AddConversationReview.js';

/** Migrations in the order they run. Add each new migration class here. */
export const MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialSchema1791460800000,
  AddConversationReview1791504000000,
];
