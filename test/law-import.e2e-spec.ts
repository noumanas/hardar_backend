import { ImportUaeWorkerLaw1793491200000 } from '../src/database/migrations/1793491200000-ImportUaeWorkerLaw.js';
import exported from '../src/database/migrations/data/uae-worker-law-2026-10-31.json' with { type: 'json' };
import { seedLawArticles } from '../src/database/seeds/law-articles.seed.js';
import { importLawArticles } from '../src/database/seeds/law-repository/import-law-repository.js';
import { LawArticle, LawTopic } from '../src/modules/knowledge/domain/law-article.entity.js';
import type { LawArticleData } from '../src/modules/knowledge/domain/law-article.repository.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const official = (number: number, body: string, topic = LawTopic.Other): LawArticleData => ({
  reference: `Decree-Law 33/2021, Art. ${number}`,
  title: `Article ${number} (Decree-Law 33/2021)`,
  body,
  topic,
  sourceUrl: 'https://www.uaelegislation.gov.ae/en/legislations/1541/download',
  verified: false,
});

describe('Importing the law repository (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('replaces the starter summaries with official text and keeps verified articles', async () => {
    await seedLawArticles(t.dataSource);
    const articles = t.dataSource.getRepository(LawArticle);
    const probation = await articles.findOneByOrFail({ reference: 'Decree-Law 33/2021, Art. 9' });
    await articles.update(probation.id, { verified: true });

    const result = await importLawArticles(t.dataSource, [
      official(19, '2. Overtime is paid at the basic wage plus at least 25%.', LawTopic.Overtime),
      official(9, 'Official probation text.'),
      official(74, 'This Decree by law is published in the Official Gazette.'),
    ]);

    expect(result).toMatchObject({ created: 1, updated: 1, keptVerified: 1 });
    expect(result.removedStarters).toBeGreaterThan(0);
    const overtime = await articles.findOneByOrFail({ reference: 'Decree-Law 33/2021, Art. 19' });
    expect(overtime).toMatchObject({
      body: '2. Overtime is paid at the basic wage plus at least 25%.',
      verified: false,
    });
    expect((await articles.findOneByOrFail({ reference: 'Decree-Law 33/2021, Art. 9' })).body).toBe(probation.body);
    expect(await articles.existsBy({ reference: 'Decree-Law 33/2021, Art. 22; Wage Protection System' })).toBe(false);
    // Starter rules that cite other sources stay until the repository covers them.
    expect(await articles.existsBy({ reference: 'MOHRE complaint services' })).toBe(true);
  });

  it('the data migration loads every exported article and can be undone', async () => {
    const articles = t.dataSource.getRepository(LawArticle);
    await articles.clear();
    const migration = new ImportUaeWorkerLaw1793491200000();
    const runner = t.dataSource.createQueryRunner();
    try {
      await migration.up(runner);
      expect(await articles.count()).toBe(exported.length);
      const overtime = await articles.findOneByOrFail({ reference: 'Decree-Law 33/2021, Art. 19' });
      expect(overtime).toMatchObject({
        title: 'Overtime (Decree-Law 33/2021)',
        topic: LawTopic.Overtime,
        verified: false,
      });
      expect(overtime.body).toContain('twenty-five percent (25%)');

      await migration.down(runner);
      expect(await articles.count()).toBe(0);
    } finally {
      await runner.release();
    }
  });

  it('never removes official articles brought in by an earlier import', async () => {
    await importLawArticles(t.dataSource, [official(19, 'Overtime text.', LawTopic.Overtime)]);
    const again = await importLawArticles(t.dataSource, [official(74, 'Changed.')]);
    expect(again).toEqual({ created: 1, updated: 0, keptVerified: 0, removedStarters: 0 });
    expect(await t.dataSource.getRepository(LawArticle).existsBy({ reference: 'Decree-Law 33/2021, Art. 19' })).toBe(
      true,
    );
  });
});
