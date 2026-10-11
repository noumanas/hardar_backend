import { URDU_REPLIES } from '../src/modules/agent/domain/urdu-replies.js';
import type { AgentRunner } from '../src/modules/agent/domain/agent-runner.port.js';
import type { ContractExtractor } from '../src/modules/contracts/domain/contract-extractor.port.js';
import { IssueType } from '../src/modules/complaints/domain/issue-type.enum.js';
import { contractTerms } from './support/builders.js';
import {
  createTestApp,
  postWebhook,
  resetDatabase,
  signature,
  textFrom,
  whatsAppWebhook,
  type TestApp,
} from './support/test-app.js';

const runner = {
  run: vi.fn(async () => ({
    text: 'آپ کی کمپنی پاسپورٹ نہیں رکھ سکتی۔',
    toolCalls: [{ name: 'search_labour_law', input: { query: 'passport' }, ok: true }],
    citations: ['Decree-Law 33/2021, Art. 13'],
    issueTypes: [IssueType.PassportHeld],
  })),
} satisfies AgentRunner;

const extractor = {
  extract: vi.fn(async () => ({
    legible: true,
    terms: contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4 }),
  })),
} satisfies ContractExtractor;

const PHONE = '971500000001';

describe('WhatsApp webhook (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp({ runner, extractor })));
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDatabase(t.dataSource);
    t.channel.texts.length = 0;
    runner.run.mockClear();
  });

  /** Posts one message as Meta would and waits for the reply to be sent. */
  async function send(message: Record<string, unknown>) {
    await postWebhook(t.http, whatsAppWebhook([message])).expect(200);
    await t.drain();
    return t.channel.lastTextTo(String(message.from));
  }

  const count = async (table: string): Promise<number> =>
    Number((await t.dataSource.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);

  describe('GET verification handshake', () => {
    it('echoes the challenge for the right verify token', async () => {
      const { text } = await t.http
        .get('/api/v1/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': '12345' })
        .expect(200);
      expect(text).toBe('12345');
    });

    it.each([
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': '1' },
      { 'hub.mode': 'subscribe', 'hub.challenge': '1' },
    ])('refuses %j', async (query) => {
      await t.http.get('/api/v1/webhooks/whatsapp').query(query).expect(403);
    });
  });

  describe('POST signature check', () => {
    const body = whatsAppWebhook([textFrom(PHONE, 'hi')]);

    it('rejects an unsigned webhook', async () => {
      await t.http.post('/api/v1/webhooks/whatsapp').set('Content-Type', 'application/json').send(body).expect(401);
    });

    it('rejects a webhook signed with another secret', async () => {
      await t.http
        .post('/api/v1/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature(body, 'not-the-secret'))
        .send(body)
        .expect(401);
      expect(await count('workers')).toBe(0);
    });

    it('acknowledges a signed webhook with the number of messages received', async () => {
      const { body: response } = await postWebhook(t.http, body).expect(200);
      expect(response).toEqual({ received: 1 });
      await t.drain();
    });
  });

  it('runs the full first-contact flow: consent, menu, then an agent answer', async () => {
    expect(await send(textFrom(PHONE, 'salam'))).toBe(URDU_REPLIES.greetingAndConsent);
    expect(await count('messages')).toBe(0); // nothing stored before consent

    expect(await send(textFrom(PHONE, 'ہاں'))).toBe(URDU_REPLIES.menu);

    const answer = await send(textFrom(PHONE, 'کیا کمپنی میرا پاسپورٹ رکھ سکتی ہے؟'));
    expect(answer).toBe(`${URDU_REPLIES.urgentNotice}\n\nآپ کی کمپنی پاسپورٹ نہیں رکھ سکتی۔`);

    const [worker] = await t.dataSource.query('SELECT phone_hash, phone_encrypted, consent_status FROM workers');
    expect(worker.consent_status).toBe('granted');
    expect(JSON.stringify(worker)).not.toContain(PHONE); // the number is never stored in clear

    const messages = await t.dataSource.query('SELECT direction, urgent, citations FROM messages ORDER BY created_at');
    expect(messages).toEqual([
      { direction: 'inbound', urgent: true, citations: [] },
      { direction: 'outbound', urgent: true, citations: ['Decree-Law 33/2021, Art. 13'] },
    ]);
    const [conversation] = await t.dataSource.query('SELECT issue_type FROM conversations');
    expect(conversation.issue_type).toBe('passport_held');
  });

  it('ignores a duplicate delivery of the same message', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom(PHONE, 'ہاں'));
    const question = textFrom(PHONE, 'سوال');

    await send(question);
    await send(question);

    expect(runner.run).toHaveBeenCalledOnce();
    expect(await count('messages')).toBe(2);
  });

  it('reads a contract photo and replies with the explanation and the summary card', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom(PHONE, 'ہاں'));

    const reply = await send({
      from: PHONE,
      id: 'wamid.photo',
      type: 'image',
      image: { id: 'img-1', mime_type: 'image/jpeg' },
    });

    expect(reply).toContain('معاہدے کا خلاصہ');
    expect(reply).toContain('روزانہ کام کے گھنٹے قانونی حد سے زیادہ ہیں (Art. 17)');
    const [summary] = await t.dataSource.query('SELECT terms, flags FROM contract_summaries');
    expect(summary.terms.workingHoursPerDay).toBe(10);
    expect(summary.flags[0].code).toBe('hours_per_day_above_limit');
  });

  it('asks the worker to type when no speech-to-text provider is configured', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom(PHONE, 'ہاں'));

    const reply = await send({
      from: PHONE,
      id: 'wamid.voice',
      type: 'audio',
      audio: { id: 'a-1', mime_type: 'audio/ogg' },
    });

    expect(reply).toBe(URDU_REPLIES.voiceNotUnderstood);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('deletes every trace of the worker on the delete command (FR-14)', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom(PHONE, 'ہاں'));
    await send(textFrom(PHONE, 'سوال'));
    expect(await count('messages')).toBeGreaterThan(0);

    expect(await send(textFrom(PHONE, 'ڈیٹا ختم کریں'))).toBe(URDU_REPLIES.dataDeleted);

    for (const table of ['workers', 'conversations', 'messages', 'contract_summaries', 'complaint_cases']) {
      expect(await count(table)).toBe(0);
    }
  });

  it('keeps different workers apart', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom('971500000002', 'salam'));

    expect(await count('workers')).toBe(2);
    expect(t.channel.lastTextTo('971500000002')).toBe(URDU_REPLIES.greetingAndConsent);
  });
});
