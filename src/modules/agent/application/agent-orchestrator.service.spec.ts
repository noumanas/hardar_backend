import { Logger } from '@nestjs/common';

import { aConversation, aMessage, aWorker } from '../../../../test/support/builders.js';
import { testConfig } from '../../../../test/support/test-config.js';
import { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { ConversationsService } from '../../conversations/application/conversations.service.js';
import { MessageDirection, MessageKind } from '../../conversations/domain/message.entity.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import type { AgentRunner } from '../domain/agent-runner.port.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, REPLIES } from '../domain/replies.js';
import { AgentOrchestrator } from './agent-orchestrator.service.js';
import type { ConsentFlow } from './consent-flow.js';
import type { InboundContentResolver, ResolvedContent } from './inbound-content.resolver.js';

const textMessage = (text: string): InboundMessage => ({
  kind: 'text',
  from: '971500000001',
  externalId: 'wamid.1',
  text,
});
const voiceMessage: InboundMessage = {
  kind: 'voice',
  from: '971500000001',
  externalId: 'wamid.2',
  media: { id: 'a-1', mimeType: 'audio/ogg' },
};

function setup() {
  const worker = aWorker();
  const conversation = aConversation();
  const workers = {
    findOrRegister: vi.fn().mockResolvedValue({ worker, isNew: false }),
    deleteAllData: vi.fn(),
    setLanguage: vi.fn(),
  };
  const conversations = {
    hasProcessed: vi.fn().mockResolvedValue(false),
    openFor: vi.fn().mockResolvedValue(conversation),
    history: vi
      .fn()
      .mockResolvedValue([
        aMessage({ direction: MessageDirection.Inbound, body: 'earlier question' }),
        aMessage({ direction: MessageDirection.Outbound, body: 'earlier answer' }),
      ]),
    recordInbound: vi.fn(),
    recordOutbound: vi.fn(),
    tagIssue: vi.fn(),
  };
  const consent = { decide: vi.fn().mockResolvedValue({ proceed: true }) };
  const content = {
    resolve: vi.fn(async (message: InboundMessage): Promise<ResolvedContent> =>
      message.kind === 'text'
        ? { type: 'prompt', kind: MessageKind.Text, body: message.text, prompt: message.text }
        : { type: 'prompt', kind: MessageKind.Voice, body: 'transcript', prompt: 'transcript' },
    ),
  };
  const runner = {
    run: vi.fn().mockResolvedValue({
      text: 'جواب',
      toolCalls: [{ name: 'search_labour_law', input: {}, ok: true }],
      citations: ['Art. 13'],
      issueTypes: [IssueType.UnpaidSalary, IssueType.PassportHeld],
    }),
  } satisfies AgentRunner;

  const orchestrator = new AgentOrchestrator(
    workers as unknown as WorkersService,
    conversations as unknown as ConversationsService,
    consent as unknown as ConsentFlow,
    content as unknown as InboundContentResolver,
    new UrgentCaseDetector(),
    runner,
    testConfig({ CONVERSATION_HISTORY_LIMIT: 8 }),
  );
  return { worker, conversation, workers, conversations, consent, content, runner, orchestrator };
}

describe('AgentOrchestrator', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('answers a question with the agent and records both sides of the exchange', async () => {
    const { conversation, conversations, runner, orchestrator } = setup();

    await expect(orchestrator.handle(textMessage('میری تنخواہ نہیں آئی'))).resolves.toEqual({
      text: 'جواب',
      voiceText: 'جواب',
    });

    expect(conversations.history).toHaveBeenCalledWith('conversation-1', 8);
    expect(runner.run).toHaveBeenCalledWith({
      message: 'میری تنخواہ نہیں آئی',
      history: [
        { role: 'user', text: 'earlier question' },
        { role: 'assistant', text: 'earlier answer' },
      ],
      context: { workerId: 'worker-1', conversationId: 'conversation-1' },
      language: 'ur',
    });
    expect(conversations.recordInbound).toHaveBeenCalledWith(conversation, {
      kind: MessageKind.Text,
      body: 'میری تنخواہ نہیں آئی',
      externalId: 'wamid.1',
      urgent: false,
    });
    expect(conversations.recordOutbound).toHaveBeenCalledWith(conversation, {
      body: 'جواب',
      toolCalls: [{ name: 'search_labour_law', input: {}, ok: true }],
      citations: ['Art. 13'],
      urgent: false,
      latencyMs: expect.any(Number),
    });
  });

  it('tags the conversation with the latest issue the tools identified', async () => {
    const { conversation, conversations, orchestrator } = setup();
    await orchestrator.handle(textMessage('q'));
    expect(conversations.tagIssue).toHaveBeenCalledWith(conversation, IssueType.PassportHeld);
  });

  it('ignores a message it has already answered (webhook retry)', async () => {
    const { conversations, workers, orchestrator } = setup();
    conversations.hasProcessed.mockResolvedValue(true);

    await expect(orchestrator.handle(textMessage('q'))).resolves.toBeNull();
    expect(workers.findOrRegister).not.toHaveBeenCalled();
  });

  it('deletes all data on the delete command, even before consent', async () => {
    const { worker, workers, consent, orchestrator } = setup();

    await expect(orchestrator.handle(textMessage('ڈیٹا ختم کریں'))).resolves.toEqual({
      text: REPLIES.ur.dataDeleted,
      voiceText: REPLIES.ur.dataDeleted,
    });
    expect(workers.deleteAllData).toHaveBeenCalledWith(worker);
    expect(consent.decide).not.toHaveBeenCalled();
  });

  it('confirms deletion in the language the command was typed in when no language was chosen', async () => {
    const { worker, orchestrator } = setup();
    worker.language = null;

    await expect(orchestrator.handle(textMessage('ডেটা মুছুন'))).resolves.toMatchObject({
      text: REPLIES.bn.dataDeleted,
    });
  });

  it('shows the language menu again, as text only, when the worker asks to change language', async () => {
    const { worker, workers, consent, orchestrator } = setup();

    await expect(orchestrator.handle(textMessage('زبان'))).resolves.toEqual({ text: LANGUAGE_MENU, voiceText: null });
    expect(workers.setLanguage).toHaveBeenCalledWith(worker, null);
    expect(consent.decide).not.toHaveBeenCalled();
  });

  it('replies with the onboarding step and stores nothing until the worker agrees', async () => {
    const { consent, conversations, runner, orchestrator } = setup();
    consent.decide.mockResolvedValue({ proceed: false, reply: REPLIES.ur.welcome, speak: true });

    await expect(orchestrator.handle(textMessage('salam'))).resolves.toEqual({
      text: REPLIES.ur.welcome,
      voiceText: REPLIES.ur.welcome,
    });
    expect(conversations.openFor).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('puts the MOHRE helpline first for an urgent case', async () => {
    const { conversations, orchestrator } = setup();

    const reply = await orchestrator.handle(textMessage('My company keeps my passport'));

    expect(reply?.text.startsWith(REPLIES.ur.urgentNotice)).toBe(true);
    expect(reply?.voiceText).toBe(reply?.text);
    expect(reply?.text.endsWith('جواب')).toBe(true);
    expect(conversations.recordInbound).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ urgent: true }),
    );
  });

  it('appends the contract card after the agent explanation', async () => {
    const { content, orchestrator } = setup();
    content.resolve.mockResolvedValueOnce({
      type: 'prompt',
      kind: MessageKind.Image,
      body: '[Contract photo]',
      prompt: '[Contract photo] terms...',
      attachment: 'معاہدے کا خلاصہ',
    });

    // The card is written only: the voice note speaks the explanation.
    await expect(orchestrator.handle(textMessage('photo'))).resolves.toEqual({
      text: 'جواب\n\nمعاہدے کا خلاصہ',
      voiceText: 'جواب',
    });
  });

  it('sends a fixed reply without the agent when the content needs one', async () => {
    const { content, conversations, runner, orchestrator } = setup();
    content.resolve.mockResolvedValueOnce({
      type: 'reply',
      kind: MessageKind.Voice,
      body: '[Voice note not understood]',
      reply: REPLIES.ur.voiceNotUnderstood,
    });

    await expect(orchestrator.handle(voiceMessage)).resolves.toEqual({
      text: REPLIES.ur.voiceNotUnderstood,
      voiceText: REPLIES.ur.voiceNotUnderstood,
    });
    expect(runner.run).not.toHaveBeenCalled();
    expect(conversations.recordOutbound).toHaveBeenCalledWith(expect.anything(), {
      body: REPLIES.ur.voiceNotUnderstood,
      latencyMs: expect.any(Number),
    });
  });

  it('falls back to the MOHRE helpline message when the content cannot be read', async () => {
    const { content, orchestrator } = setup();
    content.resolve.mockRejectedValueOnce(new Error('media download failed'));

    await expect(orchestrator.handle(voiceMessage)).resolves.toMatchObject({ text: REPLIES.ur.fallback });
  });

  it.each([
    [
      'the agent fails',
      (runner: AgentRunner & { run: ReturnType<typeof vi.fn> }) => runner.run.mockRejectedValue(new Error('API down')),
    ],
    [
      'the agent gives no answer',
      (runner: AgentRunner & { run: ReturnType<typeof vi.fn> }) =>
        runner.run.mockResolvedValue({ text: null, toolCalls: [], citations: [], issueTypes: [] }),
    ],
  ])('falls back to the MOHRE helpline message when %s', async (_case, arrange) => {
    const { runner, conversations, orchestrator } = setup();
    arrange(runner);

    await expect(orchestrator.handle(textMessage('q'))).resolves.toMatchObject({ text: REPLIES.ur.fallback });
    expect(conversations.tagIssue).not.toHaveBeenCalled();
  });

  describe("in the worker's language", () => {
    it('passes the language to the agent and to the content reader, and uses its fixed replies', async () => {
      const { worker, content, runner, orchestrator } = setup();
      worker.language = 'hi';
      runner.run.mockResolvedValue({ text: null, toolCalls: [], citations: [], issueTypes: [] });

      await expect(orchestrator.handle(textMessage('मेरा पासपोर्ट कंपनी के पास है'))).resolves.toMatchObject({
        text: `${REPLIES.hi.urgentNotice}\n\n${REPLIES.hi.fallback}`,
      });
      expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ language: 'hi' }));
      expect(content.resolve).toHaveBeenCalledWith(expect.anything(), 'worker-1', 'hi');
    });
  });
});
