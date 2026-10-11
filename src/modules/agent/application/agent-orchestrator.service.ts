import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../../config/app-config.service.js';
import { ConversationsService } from '../../conversations/application/conversations.service.js';
import type { Conversation } from '../../conversations/domain/conversation.entity.js';
import { MessageDirection, MessageKind, type Message } from '../../conversations/domain/message.entity.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import { TextToSpeech } from '../../speech/domain/speech.ports.js';
import { WorkersService } from '../../workers/application/workers.service.js';
import { AgentRunner, type AgentRunResult, type ConversationTurn } from '../domain/agent-runner.port.js';
import type { InboundMessage, OutboundReply } from '../domain/inbound-message.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';
import { isDeleteCommand } from './commands.js';
import { ConsentFlow } from './consent-flow.js';
import { InboundContentResolver, type ResolvedContent } from './inbound-content.resolver.js';

const EMPTY_RUN: AgentRunResult = { text: null, toolCalls: [], citations: [], issueTypes: [] };

/**
 * Handles one worker message end to end (PRD: every flow starts with a WhatsApp message
 * and ends with a reply in Urdu). Each step is delegated; this class only sequences them.
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  private readonly historyLimit: number;

  constructor(
    private readonly workers: WorkersService,
    private readonly conversations: ConversationsService,
    private readonly consent: ConsentFlow,
    private readonly content: InboundContentResolver,
    private readonly urgency: UrgentCaseDetector,
    private readonly runner: AgentRunner,
    private readonly speech: TextToSpeech,
    config: AppConfigService,
  ) {
    this.historyLimit = config.get('CONVERSATION_HISTORY_LIMIT');
  }

  /** Returns the reply to send, or `null` for a duplicate delivery that was already answered. */
  async handle(message: InboundMessage): Promise<OutboundReply | null> {
    const startedAt = Date.now();
    if (await this.conversations.hasProcessed(message.externalId)) return null;

    const { worker, isNew } = await this.workers.findOrRegister(message.from);

    if (message.kind === 'text' && isDeleteCommand(message.text)) {
      await this.workers.deleteAllData(worker);
      return { text: URDU_REPLIES.dataDeleted };
    }

    const decision = await this.consent.decide(worker, isNew, message);
    if (!decision.proceed) return { text: decision.reply };

    const conversation = await this.conversations.openFor(worker.id);
    const history = await this.conversations.history(conversation.id, this.historyLimit);
    const resolved = await this.resolve(message, worker.id);

    if (resolved.type === 'reply') {
      await this.conversations.recordInbound(conversation, {
        kind: resolved.kind,
        body: resolved.body,
        externalId: message.externalId,
      });
      await this.conversations.recordOutbound(conversation, {
        body: resolved.reply,
        latencyMs: Date.now() - startedAt,
      });
      return { text: resolved.reply };
    }

    const { urgent } = this.urgency.assess(resolved.body);
    await this.conversations.recordInbound(conversation, {
      kind: resolved.kind,
      body: resolved.body,
      externalId: message.externalId,
      urgent,
    });

    const run = await this.runAgent(resolved.prompt, history, worker.id, conversation);
    const answer = run.text ?? URDU_REPLIES.fallback;
    const text = [urgent ? URDU_REPLIES.urgentNotice : null, answer, resolved.attachment].filter(Boolean).join('\n\n');

    await this.conversations.recordOutbound(conversation, {
      body: text,
      toolCalls: run.toolCalls,
      citations: run.citations,
      urgent,
      latencyMs: Date.now() - startedAt,
    });

    const audio = message.kind === 'voice' ? await this.speak(text) : null;
    return audio ? { text, audio } : { text };
  }

  private async resolve(message: InboundMessage, workerId: string): Promise<ResolvedContent> {
    try {
      return await this.content.resolve(message, workerId);
    } catch (error) {
      this.logger.error(`Could not read ${message.kind} message ${message.externalId}`, errorStack(error));
      return {
        type: 'reply',
        kind: KIND_OF[message.kind],
        body: `[Unreadable ${message.kind} message]`,
        reply: URDU_REPLIES.fallback,
      };
    }
  }

  private async runAgent(
    prompt: string,
    history: Message[],
    workerId: string,
    conversation: Conversation,
  ): Promise<AgentRunResult> {
    try {
      const run = await this.runner.run({
        message: prompt,
        history: history.map(toTurn),
        context: { workerId, conversationId: conversation.id },
      });
      const issueType = run.issueTypes.at(-1);
      if (issueType) await this.conversations.tagIssue(conversation, issueType);
      return run;
    } catch (error) {
      this.logger.error(`Agent failed for conversation ${conversation.id}`, errorStack(error));
      return EMPTY_RUN;
    }
  }

  /** Voice is best-effort: if speech fails, the text reply still goes out. */
  private async speak(text: string): Promise<OutboundReply['audio'] | null> {
    try {
      return await this.speech.synthesize(text);
    } catch (error) {
      this.logger.warn(`Text-to-speech failed: ${String(error)}`);
      return null;
    }
  }
}

const toTurn = (message: Message): ConversationTurn => ({
  role: message.direction === MessageDirection.Inbound ? 'user' : 'assistant',
  text: message.body,
});

const KIND_OF: Record<InboundMessage['kind'], MessageKind> = {
  text: MessageKind.Text,
  voice: MessageKind.Voice,
  image: MessageKind.Image,
  unsupported: MessageKind.Text,
};

const errorStack = (error: unknown): string | undefined => (error instanceof Error ? error.stack : String(error));
