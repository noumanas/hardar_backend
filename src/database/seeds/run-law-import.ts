import dataSource from '../data-source.js';
import { importLawArticles, readLawRepository } from './law-repository/import-law-repository.js';

/**
 * `pnpm import:laws [repository folder]`: applies pending migrations, then loads the UAE
 * Worker Law Repository into the knowledge base, one row per article.
 */
const root = process.argv[2] ?? 'UAE_Worker_Law_Repository_2026-10-31';
const articles = readLawRepository(root);

await dataSource.initialize();
try {
  await dataSource.runMigrations({ transaction: 'each' });
  const { created, updated, keptVerified, removedStarters } = await importLawArticles(dataSource, articles);
  console.log(
    `Read ${articles.length} article(s): ${created} new, ${updated} updated, ` +
      `${keptVerified} verified kept as they are, ${removedStarters} starter summaries replaced.`,
  );
} finally {
  await dataSource.destroy();
}
