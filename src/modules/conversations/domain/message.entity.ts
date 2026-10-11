import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';
import { Conversation } from './conversation.entity.js';

export enum MessageDirection {
  Inbound = 'inbound',
  Outbound = 'outbound',
}

export enum MessageKind {
  Text = 'text',
  Voice = 'voice',
  Image = 'image',
}

/** A tool the agent called while producing a reply, kept for the accuracy dashboard. */
export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
}

/**
 * One message in a conversation. Inbound voice notes are stored as their transcript and
 * contract photos as a placeholder: media itself is never persisted (PRD: privacy).
 */
@Entity('messages')
export class Message extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Relation<Conversation>;

  @Column({ type: 'enum', enum: MessageDirection, enumName: 'message_direction' })
  direction: MessageDirection;

  @Column({ type: 'enum', enum: MessageKind, enumName: 'message_kind', default: MessageKind.Text })
  kind: MessageKind;

  @Column({ type: 'text' })
  body: string;

  /** WhatsApp message id, used to ignore webhook retries. */
  @Index({ unique: true, where: '"external_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  externalId: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  toolCalls: ToolCallRecord[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  citations: string[];

  @Column({ type: 'boolean', default: false })
  urgent: boolean;

  /** Set by an admin reviewing answer accuracy (FR-15). */
  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @Column({ type: 'text', nullable: true })
  flagReason: string | null;

  @Column({ type: 'integer', nullable: true })
  latencyMs: number | null;
}
