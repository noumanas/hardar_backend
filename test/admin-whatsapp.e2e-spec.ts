import type { AgentRunner } from '../src/modules/agent/domain/agent-runner.port.js';
import {
  ADMIN_HEADERS,
  createTestApp,
  postWebhook,
  textFrom,
  whatsAppWebhook,
  type TestApp,
} from './support/test-app.js';

const runner = {
  run: vi.fn(async () => ({ text: 'تنخواہ وقت پر ملنی چاہیے۔', toolCalls: [], citations: [], issueTypes: [] })),
} satisfies AgentRunner;

const URDU_WORKER = '971501234567';
const HINDI_WORKER = '919876543210';
const NEW_WORKER = '8801712345678';

describe('Admin WhatsApp numbers API (e2e)', () => {
  let t: TestApp;

  /** Sends WhatsApp messages from one number, in order, as Meta would. */
  async function chat(phone: string, ...texts: string[]) {
    for (const text of texts) {
      await postWebhook(t.http, whatsAppWebhook([textFrom(phone, text)])).expect(200);
      await t.drain();
    }
  }

  const get = (path: string) => t.http.get(`/api/v1/admin/whatsapp${path}`).set(ADMIN_HEADERS);

  beforeAll(async () => {
    t = await createTestApp({ runner });
    await chat(URDU_WORKER, 'salam', '1', 'ہاں', 'میری تنخواہ نہیں آئی', 'کمپنی نے پاسپورٹ رکھ لیا');
    await chat(HINDI_WORKER, 'namaste', '2', 'हाँ', 'मेरा वेतन नहीं आया');
    await chat(NEW_WORKER, 'hello');
  });
  afterAll(() => t.close());

  it('is admin only', async () => {
    await t.http.get('/api/v1/admin/whatsapp/summary').expect(401);
    await t.http.get('/api/v1/admin/whatsapp/contacts').expect(401);
    await t.http.post('/api/v1/admin/whatsapp/contacts/00000000-0000-0000-0000-000000000000/reveal').expect(401);
  });

  it('counts the numbers, their consent and their languages', async () => {
    const { body } = await get('/summary').query({ days: 7 }).expect(200);

    expect(body).toEqual({
      periodDays: 7,
      numbers: 3,
      activeSince: 3,
      consent: { pending: 1, granted: 2, declined: 0 },
      languages: { ur: 1, hi: 1, unset: 1 },
      inboundMessages: 3,
      outboundMessages: 3,
    });
  });

  it('lists every number masked, most recently active first, with its activity', async () => {
    const { body } = await get('/contacts').expect(200);

    expect(body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(body.items.map((item: { maskedPhone: string }) => item.maskedPhone)).toEqual([
      '+880 ••• 5678',
      '+91 ••• 3210',
      '+971 ••• 4567',
    ]);
    expect(body.items[2]).toMatchObject({
      language: 'ur',
      consentStatus: 'granted',
      conversationCount: 1,
      messageCount: 4,
      inboundCount: 2,
      urgentCount: 2, // the passport message and the reply to it
      lastMessage: { body: expect.stringContaining('MOHRE'), direction: 'outbound', kind: 'text' },
    });
    // A number that has not consented has nothing stored but the number itself.
    expect(body.items[0]).toMatchObject({
      language: null,
      consentStatus: 'pending',
      messageCount: 0,
      lastMessage: null,
    });
    expect(JSON.stringify(body)).not.toContain('501234567');
  });

  it('finds one exact number however it is typed, and nothing for an unknown one', async () => {
    const found = await get('/contacts').query({ phone: '+91 98765-43210' }).expect(200);
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0].maskedPhone).toBe('+91 ••• 3210');

    const missing = await get('/contacts').query({ phone: '+971 50 000 0000' }).expect(200);
    expect(missing.body).toEqual({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });

    await get('/contacts').query({ phone: 'not a number' }).expect(400);
  });

  it("shows one number's whole chat, oldest message first", async () => {
    const { body: list } = await get('/contacts').query({ phone: URDU_WORKER }).expect(200);
    const { body } = await get(`/contacts/${list.items[0].workerId}`).expect(200);

    expect(body.contact.maskedPhone).toBe('+971 ••• 4567');
    expect(body.messages.map((m: { direction: string; body: string }) => [m.direction, m.body])).toEqual([
      ['inbound', 'میری تنخواہ نہیں آئی'],
      ['outbound', 'تنخواہ وقت پر ملنی چاہیے۔'],
      ['inbound', 'کمپنی نے پاسپورٹ رکھ لیا'],
      ['outbound', expect.stringContaining('تنخواہ وقت پر ملنی چاہیے۔')],
    ]);
    expect(body.messages[2].urgent).toBe(true);
  });

  it('reveals the full number only on request', async () => {
    const { body: list } = await get('/contacts').query({ phone: URDU_WORKER }).expect(200);

    const { body } = await t.http
      .post(`/api/v1/admin/whatsapp/contacts/${list.items[0].workerId}/reveal`)
      .set(ADMIN_HEADERS)
      .expect(200);
    expect(body).toEqual({ phone: '+971 501234567' });
  });

  it('answers 404 for an unknown worker and 400 for a malformed id', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    await get(`/contacts/${unknown}`).expect(404);
    await t.http.post(`/api/v1/admin/whatsapp/contacts/${unknown}/reveal`).set(ADMIN_HEADERS).expect(404);
    await get('/contacts/not-a-uuid').expect(400);
  });
});
