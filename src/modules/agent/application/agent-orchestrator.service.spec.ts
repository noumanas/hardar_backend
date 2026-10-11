import { Logger } from '@nestjs/common';

import { aConversation, aMessage, aWorker } from '../../../../test/support/builders.js';
import { testConfig } from '../../../../test/support/test-config.js';
import { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { ConversationsService } from '../../conversations/application/conversations.service.js';
import { MessageDirection, MessageKind } from '../../conversations/domain/message.entity.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import type { TextToSpeech } from '../../speech/domain/speech.ports.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import type { AgentRunner } from '../domain/agent-runner.port.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';
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
  const speech = { synthesize: vi.fn().mockResolvedValue(null) } satisfies TextToSpeech;

  const orchestrator = new AgentOrchestrator(
    workers as unknown as WorkersService,
    conversations as unknown as ConversationsService,
    consent as unknown as ConsentFlow,
    content as unknown as InboundContentResolver,
    new UrgentCaseDetector(),
    runner,
    speech,
    testConfig({ CONVERSATION_HISTORY_LIMIT: 8 }),
  );
  return { worker, conversation, workers, conversations, consent, content, runner, speech, orchestrator };
}

describe('AgentOrchestrator', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('answers a question with the agent and records both sides of the exchange', async () => {
    const { conversation, conversations, runner, orchestrator } = setup();

    await expect(orchestrator.handle(textMessage('میری تنخواہ نہیں آئی'))).resolves.toEqual({ text: 'جواب' });

    expect(conversations.history).toHaveBeenCalledWith('conversation-1', 8);
    expect(runner.run).toHaveBeenCalledWith({
      message: 'میری تنخواہ نہیں آئی',
      history: [
        { role: 'user', text: 'earlier question' },
        { role: 'assistant', text: 'earlier answer' },
      ],
      context: { workerId: 'worker-1', conversationId: 'conversation-1' },
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
      text: URDU_REPLIES.dataDeleted,
    });
    expect(workers.deleteAllData).toHaveBeenCalledWith(worker);
    expect(consent.decide).not.toHaveBeenCalled();
  });

  it('replies with the consent step and stores nothing until the worker agrees', async () => {
    const { consent, conversations, runner, orchestrator } = setup();
    consent.decide.mockResolvedValue({ proceed: false, reply: URDU_REPLIES.greetingAndConsent });

    await expect(orchestrator.handle(textMessage('salam'))).resolves.toEqual({ text: URDU_REPLIES.greetingAndConsent });
    expect(conversations.openFor).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('puts the MOHRE helpline first for an urgent case', async () => {
    const { conversations, orchestrator } = setup();

    const reply = await orchestrator.handle(textMessage('My company keeps my passport'));

    expect(reply?.text.startsWith(URDU_REPLIES.urgentNotice)).toBe(true);
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

    await expect(orchestrator.handle(textMessage('photo'))).resolves.toEqual({ text: 'جواب\n\nمعاہدے کا خلاصہ' });
  });

  it('sends a fixed reply without the agent when the content needs one', async () => {
    const { content, conversations, runner, orchestrator } = setup();
    content.resolve.mockResolvedValueOnce({
      type: 'reply',
      kind: MessageKind.Voice,
      body: '[Voice note not understood]',
      reply: URDU_REPLIES.voiceNotUnderstood,
    });

    await expect(orchestrator.handle(voiceMessage)).resolves.toEqual({ text: URDU_REPLIES.voiceNotUnderstood });
    expect(runner.run).not.toHaveBeenCalled();
    expect(conversations.recordOutbound).toHaveBeenCalledWith(expect.anything(), {
      body: URDU_REPLIES.voiceNotUnderstood,
      latencyMs: expect.any(Number),
    });
  });

  it('falls back to the MOHRE helpline message when the content cannot be read', async () => {
    const { content, orchestrator } = setup();
    content.resolve.mockRejectedValueOnce(new Error('media download failed'));

    await expect(orchestrator.handle(voiceMessage)).resolves.toEqual({ text: URDU_REPLIES.fallback });
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

    await expect(orchestrator.handle(textMessage('q'))).resolves.toEqual({ text: URDU_REPLIES.fallback });
    expect(conversations.tagIssue).not.toHaveBeenCalled();
  });

  describe('voice replies', () => {
    it('adds a voice version when the worker wrote by voice and speech is available', async () => {
      const { speech, orchestrator } = setup();
      const audio = { data: Buffer.from('ogg'), mimeType: 'audio/ogg' };
      speech.synthesize.mockResolvedValue(audio);

      await expect(orchestrator.handle(voiceMessage)).resolves.toEqual({ text: 'جواب', audio });
    });

    it('still sends the text when speech fails', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { speech, orchestrator } = setup();
      speech.synthesize.mockRejectedValue(new Error('TTS down'));

      await expect(orchestrator.handle(voiceMessage)).resolves.toEqual({ text: 'جواب' });
    });

    it('does not speak replies to text messages', async () => {
      const { speech, orchestrator } = setup();
      await orchestrator.handle(textMessage('q'));
      expect(speech.synthesize).not.toHaveBeenCalled();
    });
  });
});
