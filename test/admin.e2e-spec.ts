import { randomUUID } from 'node:crypto';

import type { AgentRunner } from '../src/modules/agent/domain/agent-runner.port.js';
import { URDU_REPLIES } from '../src/modules/agent/domain/urdu-replies.js';
import { IssueType } from '../src/modules/complaints/domain/issue-type.enum.js';
import { seedLawArticles } from '../src/database/seeds/law-articles.seed.js';
import { ADMIN_HEADERS, createTestApp, type TestApp } from './support/test-app.js';

const runner = {
  run: vi.fn(async () => ({
    text: 'تنخواہ وقت پر ملنی چاہیے۔',
    toolCalls: [{ name: 'get_complaint_guide', input: { issueType: 'unpaid_salary' }, ok: true }],
    citations: ['Decree-Law 33/2021, Art. 22; Wage Protection System'],
    issueTypes: [IssueType.UnpaidSalary],
  })),
} satisfies AgentRunner;

describe('Admin dashboard API (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ runner });
    await seedLawArticles(t.dataSource);
  });
  afterAll(() => t.close());

  const simulate = (phone: string, text: string) =>
    t.http.post('/api/v1/admin/agent/simulate').set(ADMIN_HEADERS).send({ phone, text }).expect(200);

  it('protects every admin route', async () => {
    await t.http.get('/api/v1/admin/overview').expect(401);
    await t.http.get('/api/v1/admin/conversations').expect(401);
    await t.http.post('/api/v1/admin/agent/simulate').send({ phone: '971500000001', text: 'hi' }).expect(401);
  });

  it('runs the agent pipeline from the playground', async () => {
    expect((await simulate('971500000011', 'salam')).body).toEqual({
      reply: URDU_REPLIES.greetingAndConsent,
      hasAudio: false,
    });
    expect((await simulate('971500000011', 'ہاں')).body.reply).toBe(URDU_REPLIES.menu);
    expect((await simulate('971500000011', 'tankhwa nahi aayi')).body.reply).toBe('تنخواہ وقت پر ملنی چاہیے۔');

    await simulate('971500000012', 'salam'); // a second worker who never consents
  });

  it('validates playground input', async () => {
    await t.http
      .post('/api/v1/admin/agent/simulate')
      .set(ADMIN_HEADERS)
      .send({ phone: '+971 50', text: '' })
      .expect(400);
  });

  it('reports usage, issue types and knowledge-base status', async () => {
    const { body } = await t.http.get('/api/v1/admin/overview').query({ days: 30 }).set(ADMIN_HEADERS).expect(200);

    expect(body).toEqual({
      periodDays: 30,
      workers: { total: 2, pending: 1, granted: 1, declined: 0 },
      conversations: {
        conversations: 1,
        conversationsSince: 1,
        inboundMessages: 1,
        outboundMessages: 1,
        urgentMessages: 0,
        flaggedMessages: 0,
        citedAnswers: 1,
        averageReplyLatencyMs: expect.any(Number),
        needsReview: 0,
        withIssue: 1,
        guidedToMohre: 1,
        issueTypes: [{ issueType: 'unpaid_salary', count: 1 }],
      },
      contractsRead: 0,
      followUpsScheduled: 0,
      knowledgeBase: { articles: 13, verified: 0 },
    });
  });

  it('lists conversations without exposing phone numbers, and their full message log', async () => {
    const { body: page } = await t.http.get('/api/v1/admin/conversations').set(ADMIN_HEADERS).expect(200);

    expect(page.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(page.items[0]).toMatchObject({
      issueType: 'unpaid_salary',
      status: 'guided_to_mohre',
      preview: 'tankhwa nahi aayi',
      channel: 'text',
      messageCount: 2,
      flaggedCount: 0,
      urgentCount: 0,
      guidedToMohre: true,
      reviewedAt: null,
    });
    expect(JSON.stringify(page)).not.toContain('971500000011');

    const { body: messages } = await t.http
      .get(`/api/v1/admin/conversations/${page.items[0].id}/messages`)
      .set(ADMIN_HEADERS)
      .expect(200);
    expect(messages.map((message: { direction: string }) => message.direction)).toEqual(['inbound', 'outbound']);
    expect(messages[1]).toMatchObject({
      citations: ['Decree-Law 33/2021, Art. 22; Wage Protection System'],
      toolCalls: [{ name: 'get_complaint_guide', input: { issueType: 'unpaid_salary' }, ok: true }],
    });
  });

  it('flags a wrong answer for accuracy review, and clears the flag', async () => {
    const { body: page } = await t.http.get('/api/v1/admin/conversations').set(ADMIN_HEADERS);
    const { body: messages } = await t.http
      .get(`/api/v1/admin/conversations/${page.items[0].id}/messages`)
      .set(ADMIN_HEADERS);
    const answerId = messages[1].id;

    const flagged = await t.http
      .patch(`/api/v1/admin/messages/${answerId}/flag`)
      .set(ADMIN_HEADERS)
      .send({ flagged: true, reason: 'Wrong article cited' })
      .expect(200);
    expect(flagged.body).toMatchObject({ flagged: true, flagReason: 'Wrong article cited' });

    const overview = await t.http.get('/api/v1/admin/overview').set(ADMIN_HEADERS);
    expect(overview.body.conversations).toMatchObject({ flaggedMessages: 1, needsReview: 1 });

    const { body: flaggedPage } = await t.http.get('/api/v1/admin/messages/flagged').set(ADMIN_HEADERS).expect(200);
    expect(flaggedPage.meta.total).toBe(1);
    expect(flaggedPage.items[0]).toMatchObject({
      id: answerId,
      conversationId: page.items[0].id,
      flagReason: 'Wrong article cited',
    });

    // A flagged answer puts its conversation in the review queue.
    const { body: queue } = await t.http
      .get('/api/v1/admin/conversations')
      .query({ status: 'needs_review' })
      .set(ADMIN_HEADERS)
      .expect(200);
    expect(queue.items.map((item: { id: string }) => item.id)).toEqual([page.items[0].id]);

    const cleared = await t.http
      .patch(`/api/v1/admin/messages/${answerId}/flag`)
      .set(ADMIN_HEADERS)
      .send({ flagged: false })
      .expect(200);
    expect(cleared.body).toMatchObject({ flagged: false, flagReason: null });
  });

  it('marks a conversation reviewed, which takes it out of the queue, and reopens it', async () => {
    const { body: page } = await t.http.get('/api/v1/admin/conversations').set(ADMIN_HEADERS);
    const id = page.items[0].id;

    const reviewed = await t.http
      .patch(`/api/v1/admin/conversations/${id}/review`)
      .set(ADMIN_HEADERS)
      .send({ reviewed: true })
      .expect(200);
    expect(reviewed.body).toMatchObject({ id, reviewedAt: expect.any(String) });

    const byStatus = async (status: string) =>
      (await t.http.get('/api/v1/admin/conversations').query({ status }).set(ADMIN_HEADERS)).body.meta.total;
    expect(await byStatus('reviewed')).toBe(1);
    expect(await byStatus('guided_to_mohre')).toBe(0);

    await t.http.patch(`/api/v1/admin/conversations/${id}/review`).set(ADMIN_HEADERS).send({ reviewed: false });
    expect(await byStatus('reviewed')).toBe(0);
    expect(await byStatus('guided_to_mohre')).toBe(1);
  });

  it('reports the total even for a page past the end, and rejects unknown statuses', async () => {
    const { body } = await t.http.get('/api/v1/admin/conversations').query({ page: 5 }).set(ADMIN_HEADERS).expect(200);
    expect(body).toMatchObject({ items: [], meta: { total: 1, page: 5 } });

    await t.http.get('/api/v1/admin/conversations').query({ status: 'archived' }).set(ADMIN_HEADERS).expect(400);
  });

  it('404s for unknown conversations and messages', async () => {
    await t.http.get(`/api/v1/admin/conversations/${randomUUID()}/messages`).set(ADMIN_HEADERS).expect(404);
    await t.http
      .patch(`/api/v1/admin/conversations/${randomUUID()}/review`)
      .set(ADMIN_HEADERS)
      .send({ reviewed: true })
      .expect(404);
    await t.http
      .patch(`/api/v1/admin/messages/${randomUUID()}/flag`)
      .set(ADMIN_HEADERS)
      .send({ flagged: true })
      .expect(404);
  });
});
