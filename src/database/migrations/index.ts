import type { MigrationInterface } from 'typeorm';

import { InitialSchema1791460800000 } from './1791460800000-InitialSchema.js';
import { AddConversationReview1791504000000 } from './1791504000000-AddConversationReview.js';
import { ImportUaeWorkerLaw1793491200000 } from './1793491200000-ImportUaeWorkerLaw.js';
import { WorkerLanguageChoice1793750400000 } from './1793750400000-WorkerLanguageChoice.js';

/** Migrations in the order they run. Add each new migration class here. */
export const MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialSchema1791460800000,
  AddConversationReview1791504000000,
  ImportUaeWorkerLaw1793491200000,
  WorkerLanguageChoice1793750400000,
];
