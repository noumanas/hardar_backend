import { FinishReason } from '@google/genai';

import { createTestApp, type TestApp } from './support/test-app.js';

const MINUTE = 60_000;
const answer = {
  candidates: [{ content: { role: 'model', parts: [{ text: 'Call MOHRE.' }] }, finishReason: FinishReason.STOP }],
};

/** Rate limits on the public demo, end to end, with limits small enough to reach. */
describe('Public demo rate limits (e2e)', () => {
  const generateContent = vi.fn().mockResolvedValue(answer);

  describe('per visitor', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp({
        geminiClient: { models: { generateContent } },
        demoLimits: {
          visitor: {
            ai: [{ limit: 2, ms: MINUTE, name: 'minute' }],
            speech: [{ limit: 5, ms: MINUTE, name: 'minute' }],
            contract: [{ limit: 5, ms: MINUTE, name: 'minute' }],
          },
          everyoneHourly: { ai: 100, speech: 100, contract: 100 },
        },
      });
    });
    afterAll(() => t.close());

    const chat = () => t.http.post('/api/v1/demo/chat').send({ message: 'hi', history: [] });

    it('counts down, then refuses with Retry-After before calling the AI', async () => {
      const first = await chat().expect(200);
      expect(first.headers['x-demo-remaining']).toBe('1');
      const second = await chat().expect(200);
      expect(second.headers['x-demo-remaining']).toBe('0');
      const callsBefore = generateContent.mock.calls.length;

      const refused = await chat().expect(429);

      expect(refused.headers['x-demo-limit-scope']).toBe('visitor');
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(refused.body.message).toMatch(/demo limit for this minute/);
      expect(generateContent.mock.calls.length).toBe(callsBefore);
    });

    it('limits each kind of request separately, and leaves the scripted demo alone', async () => {
      await t.http.post('/api/v1/demo/feedback').send({ helpful: true, tools: [] }).expect(204);
      await t.http.get('/api/v1/demo/scenarios').expect(200);
      // Voice notes share the chat's limit, which is used up.
      await t.http.post('/api/v1/demo/voice').expect(429);
    });
  });

  describe('for everyone together', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp({
        geminiClient: { models: { generateContent } },
        demoLimits: {
          visitor: {
            ai: [{ limit: 50, ms: MINUTE, name: 'minute' }],
            speech: [{ limit: 50, ms: MINUTE, name: 'minute' }],
            contract: [{ limit: 50, ms: MINUTE, name: 'minute' }],
          },
          everyoneHourly: { ai: 1, speech: 1, contract: 1 },
        },
      });
    });
    afterAll(() => t.close());

    it('refuses once the shared hourly budget is spent, saying it is busy', async () => {
      await t.http.post('/api/v1/demo/chat').send({ message: 'hi', history: [] }).expect(200);

      const refused = await t.http.post('/api/v1/demo/chat').send({ message: 'hi', history: [] }).expect(429);

      expect(refused.headers['x-demo-limit-scope']).toBe('everyone');
      expect(refused.body.message).toMatch(/very busy/);
    });
  });
});
