import { LANGUAGE_MENU, REPLIES, welcomeFor } from '../src/modules/agent/domain/replies.js';
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
    t.channel.audios.length = 0;
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

  /** First contact up to the menu: language menu, then a choice (sign-up is automatic). */
  async function onboard(phone = PHONE, choice = '1') {
    await send(textFrom(phone, 'salam'));
    await send(textFrom(phone, choice));
  }

  it('runs the full first-contact flow: language, automatic sign-up with the welcome, then an agent answer', async () => {
    expect(await send(textFrom(PHONE, 'salam'))).toBe(LANGUAGE_MENU);
    expect(t.channel.audios).toEqual([]); // the four-language menu is text only

    expect(await send(textFrom(PHONE, '1'))).toBe(welcomeFor('ur'));
    expect(await count('messages')).toBe(0); // the onboarding exchange itself is not stored
    const [signedUp] = await t.dataSource.query('SELECT consent_status FROM workers');
    expect(signedUp.consent_status).toBe('granted'); // no yes/no question

    const answer = await send(textFrom(PHONE, 'کیا کمپنی میرا پاسپورٹ رکھ سکتی ہے؟'));
    expect(answer).toBe(`${REPLIES.ur.urgentNotice}\n\nآپ کی کمپنی پاسپورٹ نہیں رکھ سکتی۔`);
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ language: 'ur' }));

    const [worker] = await t.dataSource.query(
      'SELECT phone_hash, phone_encrypted, consent_status, language FROM workers',
    );
    expect(worker).toMatchObject({ consent_status: 'granted', language: 'ur' });
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
    await onboard();
    const question = textFrom(PHONE, 'سوال');

    await send(question);
    await send(question);

    expect(runner.run).toHaveBeenCalledOnce();
    expect(await count('messages')).toBe(2);
  });

  it('reads a contract photo and replies with the explanation and the summary card', async () => {
    await onboard();

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
    await onboard();

    const reply = await send({
      from: PHONE,
      id: 'wamid.voice',
      type: 'audio',
      audio: { id: 'a-1', mime_type: 'audio/ogg' },
    });

    expect(reply).toBe(REPLIES.ur.voiceNotUnderstood);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('deletes every trace of the worker on the delete command (FR-14)', async () => {
    await onboard();
    await send(textFrom(PHONE, 'سوال'));
    expect(await count('messages')).toBeGreaterThan(0);

    expect(await send(textFrom(PHONE, 'ڈیٹا ختم کریں'))).toBe(REPLIES.ur.dataDeleted);

    for (const table of ['workers', 'conversations', 'messages', 'contract_summaries', 'complaint_cases']) {
      expect(await count(table)).toBe(0);
    }
  });

  it('keeps different workers apart', async () => {
    await send(textFrom(PHONE, 'salam'));
    await send(textFrom('971500000002', 'salam'));

    expect(await count('workers')).toBe(2);
    expect(t.channel.lastTextTo('971500000002')).toBe(LANGUAGE_MENU);
  });

  describe('languages and voice notes', () => {
    it('talks to a worker in the language they chose, in text and as a voice note', async () => {
      expect(await send(textFrom(PHONE, 'hello'))).toBe(LANGUAGE_MENU);
      expect(await send(textFrom(PHONE, '4'))).toBe(welcomeFor('en'));

      runner.run.mockResolvedValueOnce({
        text: 'Your salary must be paid on time.',
        toolCalls: [],
        citations: [],
        issueTypes: [],
      });
      expect(await send(textFrom(PHONE, 'My salary is late'))).toBe('Your salary must be paid on time.');
      expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));

      // Every reply after the language menu also went out as a voice note.
      expect(t.channel.audios).toHaveLength(2);
      expect(t.channel.audios.every(({ to, audio }) => to === PHONE && audio.mimeType === 'audio/ogg')).toBe(true);
    });

    it('lets the worker switch language at any time without asking for consent again', async () => {
      await onboard(PHONE, '1');

      expect(await send(textFrom(PHONE, 'زبان'))).toBe(LANGUAGE_MENU);
      expect(await send(textFrom(PHONE, '3'))).toBe(REPLIES.bn.menu);

      const [worker] = await t.dataSource.query('SELECT language, consent_status FROM workers');
      expect(worker).toEqual({ language: 'bn', consent_status: 'granted' });
    });

    it('keeps showing the language menu until the worker picks one', async () => {
      expect(await send(textFrom(PHONE, 'salam'))).toBe(LANGUAGE_MENU);
      expect(await send(textFrom(PHONE, 'what is this?'))).toBe(LANGUAGE_MENU);
      expect(runner.run).not.toHaveBeenCalled();
    });

    it('still sends the text when the voice note fails', async () => {
      const failing = await createTestApp({
        runner,
        extractor,
        voiceNotes: { synthesize: () => Promise.reject(new Error('TTS down')) },
      });
      try {
        await postWebhook(failing.http, whatsAppWebhook([textFrom(PHONE, 'salam')])).expect(200);
        await postWebhook(failing.http, whatsAppWebhook([textFrom(PHONE, '2')])).expect(200);
        await failing.drain();

        expect(failing.channel.lastTextTo(PHONE)).toBe(welcomeFor('hi'));
        expect(failing.channel.audios).toEqual([]);
      } finally {
        await failing.close();
      }
    });
  });
});
