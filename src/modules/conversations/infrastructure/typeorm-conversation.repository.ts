import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';

import type { IssueType } from '../../complaints/domain/issue-type.enum.js';
import { Conversation } from '../domain/conversation.entity.js';
import type { ConversationStatus } from '../domain/conversation-status.js';
import {
  ConversationRepository,
  type ConversationStats,
  type ConversationSummary,
  type FlaggedMessage,
  type NewMessage,
} from '../domain/conversation.repository.js';
import { Message, MessageDirection, type MessageKind } from '../domain/message.entity.js';

/**
 * One row per conversation with everything the review queue shows, and its status.
 * The status rule lives only here, so the list, its filters and the dashboard counts agree.
 */
const SUMMARIES_CTE = `
  WITH per_conversation AS (
    SELECT
      c.id,
      c.worker_id,
      c.issue_type,
      c.last_message_at,
      c.reviewed_at,
      COUNT(m.id) AS message_count,
      COUNT(m.id) FILTER (WHERE m.flagged) AS flagged_count,
      COUNT(m.id) FILTER (WHERE m.urgent) AS urgent_count,
      COALESCE(bool_or(m.tool_calls @> '[{"name": "get_complaint_guide"}]'::jsonb), false) AS guided,
      (array_agg(m.body ORDER BY m.created_at) FILTER (WHERE m.direction = 'inbound'))[1] AS preview,
      (array_agg(m.kind ORDER BY m.created_at) FILTER (WHERE m.direction = 'inbound'))[1] AS channel
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    GROUP BY c.id
  ),
  summaries AS (
    SELECT *,
      CASE
        WHEN reviewed_at IS NOT NULL THEN 'reviewed'
        WHEN urgent_count > 0 OR flagged_count > 0 THEN 'needs_review'
        WHEN guided THEN 'guided_to_mohre'
        ELSE 'answered'
      END AS status
    FROM per_conversation
  )`;

interface SummaryRow {
  id: string;
  worker_id: string;
  issue_type: IssueType | null;
  status: ConversationStatus;
  preview: string | null;
  channel: MessageKind | null;
  message_count: string;
  flagged_count: string;
  urgent_count: string;
  guided: boolean;
  reviewed_at: Date | null;
  last_message_at: Date;
  total: string;
}

interface QueueCountsRow {
  needs_review: string;
  guided: string;
  with_issue: string;
}

@Injectable()
export class TypeOrmConversationRepository implements ConversationRepository {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
  ) {}

  findLatestForWorker(workerId: string): Promise<Conversation | null> {
    return this.conversations.findOne({ where: { workerId }, order: { lastMessageAt: 'DESC' } });
  }

  findById(id: string): Promise<Conversation | null> {
    return this.conversations.findOneBy({ id });
  }

  create(workerId: string): Promise<Conversation> {
    return this.conversations.save(this.conversations.create({ workerId, issueType: null, reviewedAt: null }));
  }

  save(conversation: Conversation): Promise<Conversation> {
    return this.conversations.save(conversation);
  }

  addMessage(message: NewMessage): Promise<Message> {
    return this.messages.save(this.messages.create(message));
  }

  messageExists(externalId: string): Promise<boolean> {
    return this.messages.existsBy({ externalId });
  }

  async recentMessages(conversationId: string, limit: number): Promise<Message[]> {
    if (limit === 0) return [];
    const latest = await this.messages.find({ where: { conversationId }, order: { createdAt: 'DESC' }, take: limit });
    return latest.reverse();
  }

  findMessage(id: string): Promise<Message | null> {
    return this.messages.findOneBy({ id });
  }

  saveMessage(message: Message): Promise<Message> {
    return this.messages.save(message);
  }

  listMessages(conversationId: string): Promise<Message[]> {
    return this.messages.find({ where: { conversationId }, order: { createdAt: 'ASC' } });
  }

  async listSummaries(
    skip: number,
    take: number,
    status?: ConversationStatus,
  ): Promise<{ items: ConversationSummary[]; total: number }> {
    const rows: SummaryRow[] = await this.conversations.query(
      `${SUMMARIES_CTE}
      SELECT *, COUNT(*) OVER () AS total
      FROM summaries
      WHERE $1::text IS NULL OR status = $1
      ORDER BY last_message_at DESC
      OFFSET $2 LIMIT $3`,
      [status ?? null, skip, take],
    );

    const total = rows.length > 0 ? Number(rows[0].total) : await this.countSummaries(status);
    return { items: rows.map(toSummary), total };
  }

  async listFlaggedMessages(skip: number, take: number): Promise<{ items: FlaggedMessage[]; total: number }> {
    const [messages, total] = await this.messages.findAndCount({
      where: { flagged: true },
      order: { updatedAt: 'DESC' },
      skip,
      take,
    });
    const items = messages.map(({ id, conversationId, body, flagReason, citations, createdAt }) => ({
      id,
      conversationId,
      body,
      flagReason,
      citations,
      createdAt,
    }));
    return { items, total };
  }

  async stats(since: Date): Promise<ConversationStats> {
    const [
      conversations,
      conversationsSince,
      byDirection,
      urgentMessages,
      flaggedMessages,
      citedAnswers,
      latency,
      issueTypes,
      queue,
    ] = await Promise.all([
      this.conversations.count(),
      this.conversations.countBy({ createdAt: MoreThanOrEqual(since) }),
      this.messages
        .createQueryBuilder('m')
        .select('m.direction', 'direction')
        .addSelect('COUNT(*)', 'count')
        .groupBy('m.direction')
        .getRawMany<{ direction: MessageDirection; count: string }>(),
      this.messages.countBy({ urgent: true }),
      this.messages.countBy({ flagged: true }),
      this.messages
        .createQueryBuilder('m')
        .where('m.direction = :direction', { direction: MessageDirection.Outbound })
        .andWhere('jsonb_array_length(m.citations) > 0')
        .getCount(),
      this.messages
        .createQueryBuilder('m')
        .select('AVG(m.latency_ms)', 'avg')
        .where('m.latency_ms IS NOT NULL')
        .getRawOne<{ avg: string | null }>(),
      this.conversations
        .createQueryBuilder('c')
        .select('c.issue_type', 'issueType')
        .addSelect('COUNT(*)', 'count')
        .where('c.issue_type IS NOT NULL')
        .groupBy('c.issue_type')
        .orderBy('count', 'DESC')
        .getRawMany<{ issueType: IssueType; count: string }>(),
      this.conversations.query<QueueCountsRow[]>(
        `${SUMMARIES_CTE}
        SELECT
          COUNT(*) FILTER (WHERE status = 'needs_review') AS needs_review,
          COUNT(*) FILTER (WHERE guided) AS guided,
          COUNT(*) FILTER (WHERE issue_type IS NOT NULL) AS with_issue
        FROM summaries`,
      ),
    ]);

    const countFor = (direction: MessageDirection): number =>
      Number(byDirection.find((row) => row.direction === direction)?.count ?? 0);
    const [counts] = queue;

    return {
      conversations,
      conversationsSince,
      inboundMessages: countFor(MessageDirection.Inbound),
      outboundMessages: countFor(MessageDirection.Outbound),
      urgentMessages,
      flaggedMessages,
      citedAnswers,
      averageReplyLatencyMs: latency?.avg ? Math.round(Number(latency.avg)) : null,
      needsReview: Number(counts?.needs_review ?? 0),
      withIssue: Number(counts?.with_issue ?? 0),
      guidedToMohre: Number(counts?.guided ?? 0),
      issueTypes: issueTypes.map((row) => ({ issueType: row.issueType, count: Number(row.count) })),
    };
  }

  /** Total when the requested page is past the end (the window count needs at least one row). */
  private async countSummaries(status?: ConversationStatus): Promise<number> {
    const [row] = await this.conversations.query<{ total: string }[]>(
      `${SUMMARIES_CTE} SELECT COUNT(*) AS total FROM summaries WHERE $1::text IS NULL OR status = $1`,
      [status ?? null],
    );
    return Number(row?.total ?? 0);
  }
}

function toSummary(row: SummaryRow): ConversationSummary {
  return {
    id: row.id,
    workerId: row.worker_id,
    issueType: row.issue_type,
    status: row.status,
    preview: row.preview,
    channel: row.channel,
    messageCount: Number(row.message_count),
    flaggedCount: Number(row.flagged_count),
    urgentCount: Number(row.urgent_count),
    guidedToMohre: row.guided,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    lastMessageAt: new Date(row.last_message_at),
  };
}
