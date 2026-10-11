import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';
import { Worker } from '../../workers/domain/worker.entity.js';
import type { ContractFlag, ContractTerms } from './contract-terms.js';

/**
 * What Haqdar remembers about a worker's contract (FR-12): the extracted terms and flags.
 * The photo itself is discarded right after extraction.
 */
@Entity('contract_summaries')
export class ContractSummary extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  workerId: string;

  @ManyToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker?: Relation<Worker>;

  @Column({ type: 'jsonb' })
  terms: ContractTerms;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  flags: ContractFlag[];
}
