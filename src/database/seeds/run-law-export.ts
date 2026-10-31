import { writeFileSync } from 'node:fs';

import { readLawRepository } from './law-repository/import-law-repository.js';

/**
 * `pnpm laws:export [repository folder] [output file]`: turns the UAE Worker Law Repository
 * into the JSON a data migration ships with, so a deployed server loads the articles without
 * the repository folder. Write each new snapshot to a new file with a new migration.
 */
const root = process.argv[2] ?? 'UAE_Worker_Law_Repository_2026-10-31';
const output = process.argv[3] ?? 'src/database/migrations/data/uae-worker-law-2026-10-31.json';

const articles = readLawRepository(root).map(({ reference, title, body, topic, sourceUrl }) => ({
  reference,
  title,
  body,
  topic,
  sourceUrl,
}));
writeFileSync(output, `${JSON.stringify(articles, null, 1)}\n`);
console.log(`Wrote ${articles.length} article(s) to ${output}.`);
