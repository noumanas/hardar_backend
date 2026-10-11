import { seedLawArticles } from '../src/database/seeds/law-articles.seed.js';
import type { ContractExtraction } from '../src/modules/contracts/domain/contract-extractor.port.js';
import { contractTerms } from './support/builders.js';
import { DEFAULT_VISITOR_LIMITS } from '../src/modules/demo/domain/demo-limits.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('Public demo API (e2e)', () => {
  let t: TestApp;
  const extract = vi.fn<() => Promise<ContractExtraction>>();
  beforeAll(async () => {
    // The real limits: the contract test checks the sixth reading in a minute is refused.
    t = await createTestApp({
      extractor: { extract },
      demoLimits: { visitor: DEFAULT_VISITOR_LIMITS, everyoneHourly: { ai: 600, speech: 600, contract: 200 } },
    });
    await seedLawArticles(t.dataSource);
  });
  afterAll(() => t.close());

  const base = '/api/v1/demo/scenarios';
  const step = (id: string, from: string, to: string) => t.http.post(`${base}/${id}/steps`).send({ from, to });

  it('lists the example cases without any sign-in', async () => {
    const { body } = await t.http.get(base).expect(200);
    expect(body.map((s: { id: string }) => s.id)).toEqual(['late-salary', 'passport-kept', 'unpaid-overtime']);
  });

  it('walks the late-salary case to the end, citing the real knowledge base', async () => {
    const start = await t.http.post(`${base}/late-salary/start`).expect(200);
    expect(start.body.nodeId).toBe('s1');

    let from = 's1';
    const path = ['s2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];
    const turns: Record<
      string,
      { messages: { source: string | null; card: { value: string } | null }[]; progress: { status: string } }
    > = {};
    for (const to of path) {
      const { body } = await step('late-salary', from, to).expect(200);
      turns[to] = body;
      from = to;
    }

    expect(turns.s3.messages[0].source).toMatch(/^Decree-Law 33\/2021/);
    expect(turns.s3.messages[1].card!.value).toBe('AED 3,000');
    expect(turns.s6.progress.status).toBe('complaint_filed');
    expect(turns.s8.messages[0].card!.value).toBe('AED 1,500');
    expect(turns.s9.progress.status).toBe('resolved');
  });

  it('computes overtime with the real calculator', async () => {
    const { body } = await step('unpaid-overtime', 'o2', 'o3').expect(200);
    expect(body.messages[0].card).toEqual({ label: 'Overtime owed this month', value: 'AED 156.25', tone: 'lilac' });
  });

  it('rejects a reply that is not offered at that step', async () => {
    await step('late-salary', 's1', 's9').expect(400);
  });

  it('validates the step body', async () => {
    await t.http.post(`${base}/late-salary/steps`).send({ from: 's1' }).expect(400);
    await step('late-salary', 'S1; DROP', 's2').expect(400);
  });

  it('returns 404 for an unknown case', async () => {
    await t.http.post(`${base}/nope/start`).expect(404);
    await step('nope', 's1', 's2').expect(404);
  });

  describe('contract photo', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const upload = (data: Buffer, filename = 'contract.jpg', contentType = 'image/jpeg') =>
      t.http.post('/api/v1/demo/contract').attach('contract', data, { filename, contentType });

    it('reads the terms and checks them against the law, without saving anything', async () => {
      extract.mockResolvedValueOnce({
        legible: true,
        terms: contractTerms({ basicMonthlySalary: 1500, probationMonths: 9 }),
      });

      const { body } = await upload(JPEG).expect(200);

      expect(extract).toHaveBeenCalledWith({ data: JPEG, mimeType: 'image/jpeg' });
      expect(body.legible).toBe(true);
      expect(body.terms).toContainEqual({ label: 'Basic salary', value: 'AED 1,500 a month' });
      expect(body.flags).toContainEqual(expect.objectContaining({ title: 'Probation is longer than the law allows' }));
      const [{ count }] = await t.dataSource.query<{ count: string }[]>('SELECT count(*) FROM contract_summaries');
      expect(count).toBe('0');
    });

    it('reads a PDF contract too, and asks for a clearer copy when it cannot be read', async () => {
      extract.mockResolvedValueOnce({ legible: false, terms: contractTerms() });
      const pdf = Buffer.from('%PDF-1.7\n1 0 obj');

      const { body } = await upload(pdf, 'contract.pdf', 'application/pdf').expect(200);

      expect(extract).toHaveBeenCalledWith({ data: pdf, mimeType: 'application/pdf' });
      expect(body).toEqual({ legible: false, message: expect.stringContaining('this PDF') });
    });

    it('rejects a missing, wrong-type or oversized file, then rate-limits', async () => {
      await t.http.post('/api/v1/demo/contract').expect(400);
      await upload(Buffer.from('hello'), 'contract.txt', 'text/plain').expect(415);
      await upload(Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)])).expect(413);
      // Five readings a minute per address: the sixth is refused before the photo is read.
      await upload(JPEG).expect(429);
    });
  });
});
