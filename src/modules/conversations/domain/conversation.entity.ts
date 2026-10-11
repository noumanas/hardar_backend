import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';
import { IssueType } from '../../complaints/domain/issue-type.enum.js';
import { Worker } from '../../workers/domain/worker.entity.js';
import { Message } from './message.entity.js';

/** A WhatsApp session with one worker; a new one opens after 24 hours of silence. */
@Entity('conversations')
export class Conversation extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  workerId: string;

  @ManyToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker?: Relation<Worker>;

  @Column({ type: 'enum', enum: IssueType, enumName: 'issue_type', nullable: true })
  issueType: IssueType | null;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastMessageAt: Date;

  /** Set when an admin marks the conversation as reviewed; clears it from the review queue. */
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @OneToMany(() => Message, (message) => message.conversation)
  messages?: Relation<Message[]>;
}
