import dataSource from '../data-source.js';
import { seedLawArticles } from './law-articles.seed.js';

/** `pnpm seed`: applies pending migrations, then loads the starter knowledge base. */
await dataSource.initialize();
try {
  await dataSource.runMigrations({ transaction: 'each' });
  const inserted = await seedLawArticles(dataSource);
  console.log(`Seeded ${inserted} law article(s).`);
} finally {
  await dataSource.destroy();
}
