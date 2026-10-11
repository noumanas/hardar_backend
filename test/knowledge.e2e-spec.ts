import { LAW_ARTICLE_SEED, seedLawArticles } from '../src/database/seeds/law-articles.seed.js';
import { ADMIN_HEADERS, createTestApp, type TestApp } from './support/test-app.js';

describe('Knowledge base API (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await seedLawArticles(t.dataSource);
  });
  afterAll(() => t.close());

  const base = '/api/v1/admin/knowledge';

  it('requires the admin API key', async () => {
    await t.http.get(base).expect(401);
    await t.http.get(base).set('x-api-key', 'wrong').expect(401);
  });

  it('lists the seeded articles, paged and filterable by topic', async () => {
    const { body } = await t.http.get(base).query({ limit: 5 }).set(ADMIN_HEADERS).expect(200);
    expect(body.meta).toEqual({ page: 1, limit: 5, total: LAW_ARTICLE_SEED.length, totalPages: 3 });

    const overtime = await t.http.get(base).query({ topic: 'overtime' }).set(ADMIN_HEADERS).expect(200);
    expect(overtime.body.items).toEqual([expect.objectContaining({ reference: 'Decree-Law 33/2021, Art. 19' })]);
  });

  it('filters by verification status', async () => {
    const unverified = await t.http.get(base).query({ verified: 'false' }).set(ADMIN_HEADERS).expect(200);
    expect(unverified.body.meta.total).toBe(LAW_ARTICLE_SEED.length);

    const verified = await t.http.get(base).query({ verified: 'true' }).set(ADMIN_HEADERS).expect(200);
    expect(verified.body.meta.total).toBe(0);

    await t.http.get(base).query({ verified: 'maybe' }).set(ADMIN_HEADERS).expect(400);
  });

  describe('full-text search (what the agent retrieves)', () => {
    it.each([
      ['can my company keep my passport', 'Decree-Law 33/2021, Art. 13'],
      ['how much extra pay for working at night', 'Decree-Law 33/2021, Art. 19'],
      ['end of service money after 6 years', 'Decree-Law 33/2021, Art. 51'],
      ['who pays the recruitment agent fees', 'Decree-Law 33/2021, Art. 6'],
    ])('ranks the right rule first for "%s"', async (q, reference) => {
      const { body } = await t.http.get(`${base}/search`).query({ q }).set(ADMIN_HEADERS).expect(200);

      expect(body[0].article.reference).toBe(reference);
      expect(body[0].rank).toBeGreaterThan(0);
    });

    it('returns nothing when no article shares a word with the question', async () => {
      const { body } = await t.http.get(`${base}/search`).query({ q: 'zebra' }).set(ADMIN_HEADERS).expect(200);
      expect(body).toEqual([]);
    });

    it('is safe against tsquery syntax in user input', async () => {
      await t.http.get(`${base}/search`).query({ q: "passport' | !& :* (" }).set(ADMIN_HEADERS).expect(200);
    });

    it('requires a query', async () => {
      await t.http.get(`${base}/search`).set(ADMIN_HEADERS).expect(400);
    });
  });

  it('creates, reads, verifies and deletes an article, and makes it searchable', async () => {
    const created = await t.http
      .post(base)
      .set(ADMIN_HEADERS)
      .send({
        reference: 'Decree-Law 33/2021, Art. 27',
        title: 'Sick leave',
        body: 'After probation, a worker gets up to 90 days of sick leave a year.',
        topic: 'leave',
      })
      .expect(201);
    expect(created.body).toMatchObject({ id: expect.any(String), verified: false, sourceUrl: null });
    expect(created.body.searchVector).toBeUndefined();

    const id = created.body.id;
    const search = await t.http.get(`${base}/search`).query({ q: 'sick leave' }).set(ADMIN_HEADERS).expect(200);
    expect(search.body[0].article.id).toBe(id);

    await t.http.patch(`${base}/${id}`).set(ADMIN_HEADERS).send({ verified: true }).expect(200);
    const { body } = await t.http.get(`${base}/${id}`).set(ADMIN_HEADERS).expect(200);
    expect(body.verified).toBe(true);

    await t.http.delete(`${base}/${id}`).set(ADMIN_HEADERS).expect(204);
    await t.http.get(`${base}/${id}`).set(ADMIN_HEADERS).expect(404);
    await t.http.delete(`${base}/${id}`).set(ADMIN_HEADERS).expect(404);
  });

  it('validates article input and ids', async () => {
    const { body } = await t.http.post(base).set(ADMIN_HEADERS).send({ reference: '', topic: 'astrology' }).expect(400);
    expect(body.message).toEqual(
      expect.arrayContaining([
        'reference should not be empty',
        'title must be a string',
        'body must be a string',
        expect.stringMatching(/^topic must be one of the following values/),
      ]),
    );
    await t.http.get(`${base}/not-a-uuid`).set(ADMIN_HEADERS).expect(400);
  });
});
