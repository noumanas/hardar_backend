import { Injectable, NotFoundException } from '@nestjs/common';

import type { Page } from '../../../common/dto/pagination.dto.js';
import { PageMetaDto } from '../../../common/dto/pagination.dto.js';
import type { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { Conversation } from '../domain/conversation.entity.js';
import type { ConversationStatus } from '../domain/conversation-status.js';
import {
  ConversationRepository,
  type ConversationStats,
  type ConversationSummary,
  type FlaggedMessage,
} from '../domain/conversation.repository.js';
import { MessageDirection, MessageKind, type Message, type ToolCallRecord } from '../domain/message.entity.js';

/** WhatsApp lets a business reply freely for 24 hours after the worker's last message. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InboundRecord {
  kind: MessageKind;
  body: string;
  externalId?: string;
  urgent?: boolean;
}

export interface OutboundRecord {
  body: string;
  toolCalls?: ToolCallRecord[];
  citations?: string[];
  urgent?: boolean;
  latencyMs?: number;
}

@Injectable()
export class ConversationsService {
  constructor(private readonly repository: ConversationRepository) {}

  /** Continues the worker's current session, or opens a new one after 24 hours of silence. */
  async openFor(workerId: string, now = new Date()): Promise<Conversation> {
    const latest = await this.repository.findLatestForWorker(workerId);
    if (latest && now.getTime() - latest.lastMessageAt.getTime() < SESSION_WINDOW_MS) {
      return latest;
    }
    return this.repository.create(workerId);
  }

  hasProcessed(externalId: string): Promise<boolean> {
    return this.repository.messageExists(externalId);
  }

  async recordInbound(conversation: Conversation, record: InboundRecord): Promise<Message> {
    return this.addMessage(conversation, { ...record, direction: MessageDirection.Inbound });
  }

  async recordOutbound(conversation: Conversation, record: OutboundRecord): Promise<Message> {
    return this.addMessage(conversation, { ...record, kind: MessageKind.Text, direction: MessageDirection.Outbound });
  }

  history(conversationId: string, limit: number): Promise<Message[]> {
    return this.repository.recentMessages(conversationId, limit);
  }

  async tagIssue(conversation: Conversation, issueType: IssueType): Promise<void> {
    if (conversation.issueType === issueType) return;
    conversation.issueType = issueType;
    await this.repository.save(conversation);
  }

  async list(page: number, limit: number, status?: ConversationStatus): Promise<Page<ConversationSummary>> {
    const { items, total } = await this.repository.listSummaries((page - 1) * limit, limit, status);
    return { items, meta: PageMetaDto.of(page, limit, total) };
  }

  /** An admin marks a conversation as reviewed (or reopens it), clearing it from the queue. */
  async setReviewed(conversationId: string, reviewed: boolean, now = new Date()): Promise<Conversation> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) throw new NotFoundException(`Conversation ${conversationId} not found`);
    conversation.reviewedAt = reviewed ? now : null;
    return this.repository.save(conversation);
  }

  async flaggedMessages(page: number, limit: number): Promise<Page<FlaggedMessage>> {
    const { items, total } = await this.repository.listFlaggedMessages((page - 1) * limit, limit);
    return { items, meta: PageMetaDto.of(page, limit, total) };
  }

  async messagesOf(conversationId: string): Promise<Message[]> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) throw new NotFoundException(`Conversation ${conversationId} not found`);
    return this.repository.listMessages(conversationId);
  }

  /** FR-15: an admin marks an answer as wrong (or clears the flag) during accuracy review. */
  async flagMessage(messageId: string, flagged: boolean, reason?: string): Promise<Message> {
    const message = await this.repository.findMessage(messageId);
    if (!message) throw new NotFoundException(`Message ${messageId} not found`);
    message.flagged = flagged;
    message.flagReason = flagged ? (reason ?? null) : null;
    return this.repository.saveMessage(message);
  }

  stats(since: Date): Promise<ConversationStats> {
    return this.repository.stats(since);
  }

  private async addMessage(
    conversation: Conversation,
    record: (InboundRecord | OutboundRecord) & { direction: MessageDirection; kind: MessageKind },
  ): Promise<Message> {
    const message = await this.repository.addMessage({ ...record, conversationId: conversation.id });
    conversation.lastMessageAt = message.createdAt ?? new Date();
    await this.repository.save(conversation);
    return message;
  }
}
