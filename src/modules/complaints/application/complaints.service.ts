import { Injectable } from '@nestjs/common';

import type { ComplaintCase } from '../domain/complaint-case.entity.js';
import { ComplaintCaseRepository } from '../domain/complaint-case.repository.js';
import { allComplaintGuides, complaintGuideFor, type ComplaintGuide } from '../domain/complaint-guides.js';
import type { IssueType } from '../domain/issue-type.enum.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_FOLLOW_UP_DAYS = 1;
export const MAX_FOLLOW_UP_DAYS = 30;

@Injectable()
export class ComplaintsService {
  constructor(private readonly cases: ComplaintCaseRepository) {}

  /** FR-10: documents, steps and MOHRE contact options for an issue. */
  guideFor(issueType: IssueType): ComplaintGuide {
    return complaintGuideFor(issueType);
  }

  allGuides(): ComplaintGuide[] {
    return allComplaintGuides();
  }

  /** Follow-ups workers have agreed to, sent or not. */
  countFollowUps(): Promise<number> {
    return this.cases.count();
  }

  /** FR-13: remembers the complaint and schedules a check-in message. */
  scheduleFollowUp(workerId: string, issueType: IssueType, inDays: number, now = new Date()): Promise<ComplaintCase> {
    const days = Math.min(Math.max(Math.round(inDays), MIN_FOLLOW_UP_DAYS), MAX_FOLLOW_UP_DAYS);
    return this.cases.create({ workerId, issueType, followUpAt: new Date(now.getTime() + days * DAY_MS) });
  }
}
