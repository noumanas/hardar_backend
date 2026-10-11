import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';
import { Worker } from '../../workers/domain/worker.entity.js';
import { IssueType } from './issue-type.enum.js';

export enum CaseStatus {
  Open = 'open',
  FollowUpSent = 'follow_up_sent',
  Closed = 'closed',
}

/** A worker's complaint that Haqdar will check on later (FR-13). */
@Entity('complaint_cases')
@Index(['status', 'followUpAt'])
export class ComplaintCase extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  workerId: string;

  @ManyToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker?: Relation<Worker>;

  @Column({ type: 'enum', enum: IssueType, enumName: 'issue_type' })
  issueType: IssueType;

  @Column({ type: 'enum', enum: CaseStatus, enumName: 'case_status', default: CaseStatus.Open })
  status: CaseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  followUpAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  followUpSentAt: Date | null;
}
