import { FinishReason, type Part } from '@google/genai';

import { seedLawArticles } from '../src/database/seeds/law-articles.seed.js';
import { AGENT_SYSTEM_PROMPT } from '../src/modules/agent/domain/system-prompt.js';
import { FOLLOW_UP_TEXT, FollowUpScheduler } from '../src/modules/complaints/application/follow-up.scheduler.js';
import { createTestApp, postWebhook, textFrom, whatsAppWebhook, type TestApp } from './support/test-app.js';

/**
 * The real agent loop end to end: a scripted Gemini decides which tools to call, and the
 * tools run for real against Postgres (contract lookup, calculator, full-text law search,
 * complaint guide, follow-up scheduling). Only the network call to Google is replaced.
 */
const modelTurn = (...parts: Part[]) => ({
  candidates: [{ content: { role: 'model', parts }, finishReason: FinishReason.STOP }],
});
const text = (value: string): Part => ({ text: value });
const call = (id: string, name: string, args: Record<string, unknown>): Part => ({ functionCall: { id, name, args } });

const generateContent = vi.fn();
const geminiClient = { models: { generateContent } };

const PHONE = '971500000009';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Agent flow with real tools (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ geminiClient });
    await seedLawArticles(t.dataSource);
  });
  afterAll(() => t.close());

  async function send(body: string): Promise<string | undefined> {
    await postWebhook(t.http, whatsAppWebhook([textFrom(PHONE, body)])).expect(200);
    await t.drain();
    return t.channel.lastTextTo(PHONE);
  }

  /** What each tool returned in the n-th request, by call id. */
  const toolOutputsIn = (request: number): Record<string, unknown> =>
    Object.fromEntries(
      (generateContent.mock.calls[request][0].contents.at(-1).parts as Part[]).map((part) => [
        part.functionResponse?.id,
        part.functionResponse?.response?.output,
      ]),
    );

  it('agrees to consent first', async () => {
    await send('salam');
    await send('ہاں');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('answers a gratuity question with coded numbers and a cited rule', async () => {
    generateContent
      .mockResolvedValueOnce(modelTurn(call('t0', 'get_saved_contract', {})))
      .mockResolvedValueOnce(
        modelTurn(
          call('t1', 'calculate_gratuity', {
            basicMonthlySalary: 1500,
            startDate: '2019-03-01',
            endDate: '2025-03-01',
          }),
          call('t2', 'search_labour_law', { query: 'end of service gratuity' }),
        ),
      )
      .mockResolvedValueOnce(modelTurn(text('آپ کو تقریباً 6758 درہم ملیں گے۔ (Decree-Law 33/2021, Art. 51)')));

    const answer = await send('6 saal kaam kiya, tankhwa 1500, end of service kitna milega?');

    expect(answer).toBe('آپ کو تقریباً 6758 درہم ملیں گے۔ (Decree-Law 33/2021, Art. 51)');

    const firstRequest = generateContent.mock.calls[0][0];
    expect(firstRequest.config.systemInstruction).toBe(AGENT_SYSTEM_PROMPT);
    expect(firstRequest.contents.at(-1)).toEqual({
      role: 'user',
      parts: [{ text: '6 saal kaam kiya, tankhwa 1500, end of service kitna milega?' }],
    });

    // No contract photo was sent, so the agent has to use the numbers the worker gave.
    expect(toolOutputsIn(1)).toEqual({ t0: { found: false } });

    const outputs = toolOutputsIn(2);
    expect(outputs.t1).toMatchObject({ amount: 6758.22, currency: 'AED', eligible: true });
    expect((outputs.t2 as { articles: unknown[] }).articles[0]).toMatchObject({
      reference: 'Decree-Law 33/2021, Art. 51',
      verified: false,
    });

    const [outbound] = await t.dataSource.query(
      "SELECT citations, tool_calls FROM messages WHERE direction = 'outbound' ORDER BY created_at DESC LIMIT 1",
    );
    expect(outbound.citations).toEqual(
      expect.arrayContaining(['Federal Decree-Law No. 33 of 2021, Art. 51', 'Decree-Law 33/2021, Art. 51']),
    );
    expect(outbound.tool_calls.map((toolCall: { name: string }) => toolCall.name)).toEqual([
      'get_saved_contract',
      'calculate_gratuity',
      'search_labour_law',
    ]);
    const [conversation] = await t.dataSource.query('SELECT issue_type FROM conversations');
    expect(conversation.issue_type).toBe('end_of_service');
  });

  it('remembers the conversation and schedules a follow-up the worker agreed to', async () => {
    generateContent.mockClear();
    generateContent
      .mockResolvedValueOnce(
        modelTurn(
          call('t3', 'get_complaint_guide', { issueType: 'unpaid_salary' }),
          call('t4', 'schedule_follow_up', { issueType: 'unpaid_salary', inDays: 7 }),
        ),
      )
      .mockResolvedValueOnce(modelTurn(text('یہ دستاویزات تیار کریں... میں 7 دن بعد پوچھوں گا۔')));

    await send('tankhwa 2 mahine se nahi aayi, haan 7 din baad yaad dilana');

    // The earlier exchange is replayed from the database as conversation history.
    const history = generateContent.mock.calls[0][0].contents;
    expect(history[0]).toEqual({
      role: 'user',
      parts: [{ text: '6 saal kaam kiya, tankhwa 1500, end of service kitna milega?' }],
    });
    expect(history[1].role).toBe('model');

    const outputs = toolOutputsIn(1);
    expect(outputs.t3).toMatchObject({ title: 'Late or unpaid salary' });
    expect(outputs.t4).toMatchObject({ scheduled: true });

    const [complaintCase] = await t.dataSource.query('SELECT status, follow_up_at FROM complaint_cases');
    expect(complaintCase.status).toBe('open');
    expect(new Date(complaintCase.follow_up_at).getTime() - Date.now()).toBeGreaterThan(6.9 * DAY_MS);
  });

  it('sends the follow-up when it falls due, to the decrypted number (FR-13)', async () => {
    t.channel.texts.length = 0;
    const scheduler = t.app.get(FollowUpScheduler);

    await expect(scheduler.sendDueFollowUps(new Date())).resolves.toBe(0);
    await expect(scheduler.sendDueFollowUps(new Date(Date.now() + 8 * DAY_MS))).resolves.toBe(1);

    expect(t.channel.texts).toEqual([{ to: PHONE, text: FOLLOW_UP_TEXT }]);
    const [complaintCase] = await t.dataSource.query('SELECT status, follow_up_sent_at FROM complaint_cases');
    expect(complaintCase.status).toBe('follow_up_sent');
    expect(complaintCase.follow_up_sent_at).not.toBeNull();
  });

  it('still answers safely when Gemini is unavailable or blocks the answer', async () => {
    generateContent.mockRejectedValueOnce(new Error('503 overloaded'));
    expect(await send('ek aur sawal')).toContain('600590000');

    generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: FinishReason.SAFETY }] });
    expect(await send('aur ek sawal')).toContain('600590000');
  });
});
