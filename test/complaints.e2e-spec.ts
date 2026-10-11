import { ISSUE_TYPES } from '../src/modules/complaints/domain/issue-type.enum.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('Complaint guides API (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  it('lists a guide for every issue type', async () => {
    const { body } = await t.http.get('/api/v1/complaints/guides').expect(200);
    expect(body.map((guide: { issueType: string }) => guide.issueType)).toEqual(ISSUE_TYPES);
  });

  it('returns one guide with documents, steps and MOHRE channels', async () => {
    const { body } = await t.http.get('/api/v1/complaints/guides/passport_held').expect(200);

    expect(body).toMatchObject({ issueType: 'passport_held', title: 'Passport kept by employer' });
    expect(body.channels).toContainEqual({ name: 'MOHRE call centre', detail: '600590000' });
  });

  it('rejects an unknown issue type', async () => {
    await t.http.get('/api/v1/complaints/guides/visa_problem').expect(400);
  });
});
