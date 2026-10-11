import type { ComplaintCase } from './complaint-case.entity.js';

export abstract class ComplaintCaseRepository {
  abstract create(data: Pick<ComplaintCase, 'workerId' | 'issueType' | 'followUpAt'>): Promise<ComplaintCase>;
  /** Open cases whose follow-up time has passed, oldest first. */
  abstract findDueFollowUps(now: Date, limit: number): Promise<ComplaintCase[]>;
  abstract save(complaintCase: ComplaintCase): Promise<ComplaintCase>;
  abstract count(): Promise<number>;
}
