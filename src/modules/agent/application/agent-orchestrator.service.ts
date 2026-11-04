import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../../config/app-config.service.js';
import { ConversationsService } from '../../conversations/application/conversations.service.js';
import type { Conversation } from '../../conversations/domain/conversation.entity.js';
import { MessageDirection, MessageKind, type Message } from '../../conversations/domain/message.entity.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import { WorkersService } from '../../workers/application/workers.service.js';
import { languageOf, type Language } from '../../workers/domain/language.js';
import { AgentRunner, type AgentRunResult, type ConversationTurn } from '../domain/agent-runner.port.js';
import type { InboundMessage, OutboundReply } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, REPLIES } from '../domain/replies.js';
import { isLanguageCommand, parseDeleteCommand } from './commands.js';
import { ConsentFlow } from './consent-flow.js';
import { InboundContentResolver, type ResolvedContent } from './inbound-content.resolver.js';

const EMPTY_RUN: AgentRunResult = { text: null, toolCalls: [], citations: [], issueTypes: [] };

/** A reply that goes out as text and is also spoken as a voice note. */
const spoken = (text: string): OutboundReply => ({ text, voiceText: text });

/**
 * Handles one worker message end to end (PRD: every flow starts with a WhatsApp message
 * and ends with a reply in the worker's language). Each step is delegated; this class only
 * sequences them.
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
    config: AppConfigService,
  ) {
    this.historyLimit = config.get('CONVERSATION_HISTORY_LIMIT');
  }

  /** Returns the reply to send, or `null` for a duplicate delivery that was already answered. */
  async handle(message: InboundMessage): Promise<OutboundReply | null> {
    const startedAt = Date.now();
    if (await this.conversations.hasProcessed(message.externalId)) return null;

    const { worker } = await this.workers.findOrRegister(message.from);

    if (message.kind === 'text') {
      const deleteIn = parseDeleteCommand(message.text);
      if (deleteIn) {
        // Answered in the worker's language, or in the language the command was typed in.
        const language = worker.language ?? deleteIn;
        await this.workers.deleteAllData(worker);
        return spoken(REPLIES[language].dataDeleted);
      }
      if (isLanguageCommand(message.text)) {
        await this.workers.setLanguage(worker, null);
        return { text: LANGUAGE_MENU, voiceText: null };
      }
    }

    const decision = await this.consent.decide(worker, message);
    if (!decision.proceed) return { text: decision.reply, voiceText: decision.speak ? decision.reply : null };

    const language = languageOf(worker);
    const replies = REPLIES[language];
    const conversation = await this.conversations.openFor(worker.id);
    const history = await this.conversations.history(conversation.id, this.historyLimit);
    const resolved = await this.resolve(message, worker.id, language);

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
      return spoken(resolved.reply);
    }

    const { urgent } = this.urgency.assess(resolved.body);
    await this.conversations.recordInbound(conversation, {
      kind: resolved.kind,
      body: resolved.body,
      externalId: message.externalId,
      urgent,
    });

    const run = await this.runAgent(resolved.prompt, history, worker.id, conversation, language);
    const answer = run.text ?? replies.fallback;
    const said = [urgent ? replies.urgentNotice : null, answer].filter(Boolean).join('\n\n');
    const text = [said, resolved.attachment].filter(Boolean).join('\n\n');

    await this.conversations.recordOutbound(conversation, {
      body: text,
      toolCalls: run.toolCalls,
      citations: run.citations,
      urgent,
      latencyMs: Date.now() - startedAt,
    });

    // The voice note carries the answer; the contract card stays in the text only.
    return { text, voiceText: said };
  }

  private async resolve(message: InboundMessage, workerId: string, language: Language): Promise<ResolvedContent> {
    try {
      return await this.content.resolve(message, workerId, language);
    } catch (error) {
      this.logger.error(`Could not read ${message.kind} message ${message.externalId}`, errorStack(error));
      return {
        type: 'reply',
        kind: KIND_OF[message.kind],
        body: `[Unreadable ${message.kind} message]`,
        reply: REPLIES[language].fallback,
      };
    }
  }

  private async runAgent(
    prompt: string,
    history: Message[],
    workerId: string,
    conversation: Conversation,
    language: Language,
  ): Promise<AgentRunResult> {
    try {
      const run = await this.runner.run({
        message: prompt,
        history: history.map(toTurn),
        context: { workerId, conversationId: conversation.id },
        language,
      });
      const issueType = run.issueTypes.at(-1);
      if (issueType) await this.conversations.tagIssue(conversation, issueType);
      return run;
    } catch (error) {
      this.logger.error(`Agent failed for conversation ${conversation.id}`, errorStack(error));
      return EMPTY_RUN;
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
