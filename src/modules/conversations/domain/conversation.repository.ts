import type { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { Conversation } from './conversation.entity.js';
import type { ConversationStatus } from './conversation-status.js';
import type { Message, MessageKind } from './message.entity.js';

export type NewMessage = Pick<Message, 'conversationId' | 'direction' | 'kind' | 'body'> &
  Partial<Pick<Message, 'externalId' | 'toolCalls' | 'citations' | 'urgent' | 'latencyMs'>>;

export interface ConversationSummary {
  id: string;
  workerId: string;
  issueType: IssueType | null;
  status: ConversationStatus;
  /** The worker's first message, for the list preview. */
  preview: string | null;
  /** How the worker first wrote: text, voice or image. */
  channel: MessageKind | null;
  messageCount: number;
  flaggedCount: number;
  urgentCount: number;
  guidedToMohre: boolean;
  reviewedAt: Date | null;
  lastMessageAt: Date;
}

export interface ConversationStats {
  conversations: number;
  conversationsSince: number;
  inboundMessages: number;
  outboundMessages: number;
  urgentMessages: number;
  flaggedMessages: number;
  /** Agent answers that cite at least one law reference. */
  citedAnswers: number;
  averageReplyLatencyMs: number | null;
  /** Conversations still waiting for an admin (urgent or flagged, not yet reviewed). */
  needsReview: number;
  withIssue: number;
  guidedToMohre: number;
  issueTypes: { issueType: IssueType; count: number }[];
}

export interface FlaggedMessage {
  id: string;
  conversationId: string;
  body: string;
  flagReason: string | null;
  citations: string[];
  createdAt: Date;
}

/** Persistence port for conversations and their messages. */
export abstract class ConversationRepository {
  abstract findLatestForWorker(workerId: string): Promise<Conversation | null>;
  abstract findById(id: string): Promise<Conversation | null>;
  abstract create(workerId: string): Promise<Conversation>;
  abstract save(conversation: Conversation): Promise<Conversation>;

  abstract addMessage(message: NewMessage): Promise<Message>;
  abstract messageExists(externalId: string): Promise<boolean>;
  /** The latest `limit` messages, oldest first. */
  abstract recentMessages(conversationId: string, limit: number): Promise<Message[]>;
  abstract findMessage(id: string): Promise<Message | null>;
  abstract saveMessage(message: Message): Promise<Message>;
  abstract listMessages(conversationId: string): Promise<Message[]>;

  abstract listSummaries(
    skip: number,
    take: number,
    status?: ConversationStatus,
  ): Promise<{ items: ConversationSummary[]; total: number }>;
  abstract listFlaggedMessages(skip: number, take: number): Promise<{ items: FlaggedMessage[]; total: number }>;
  abstract stats(since: Date): Promise<ConversationStats>;
}
