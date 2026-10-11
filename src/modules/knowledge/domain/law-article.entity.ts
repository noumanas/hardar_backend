import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';

export enum LawTopic {
  Contract = 'contract',
  Salary = 'salary',
  WorkingHours = 'working_hours',
  Overtime = 'overtime',
  Leave = 'leave',
  Probation = 'probation',
  Gratuity = 'gratuity',
  Termination = 'termination',
  Passport = 'passport',
  RecruitmentFees = 'recruitment_fees',
  Safety = 'safety',
  Complaints = 'complaints',
  Other = 'other',
}

/**
 * One rule from an official UAE source (PRD: Knowledge base). The agent may only answer
 * legal questions from these articles and must cite `reference` in its reply.
 */
@Entity('law_articles')
@Index('IDX_law_articles_search_vector', ['searchVector'], { type: 'gin' })
export class LawArticle extends BaseEntity {
  /** How the rule is cited to the worker, e.g. "Decree-Law 33/2021, Art. 19". */
  @Column({ type: 'varchar', length: 160 })
  reference: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Index()
  @Column({ type: 'enum', enum: LawTopic, enumName: 'law_topic' })
  topic: LawTopic;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;

  /** True once a person has checked the text against current MOHRE material. */
  @Column({ type: 'boolean', default: false })
  verified: boolean;

  /** Weighted full-text index over title (A) and body (B), maintained by Postgres. */
  @Column({
    type: 'tsvector',
    select: false,
    insert: false,
    update: false,
    generatedType: 'STORED',
    asExpression: `setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B')`,
  })
  searchVector?: string;
}
