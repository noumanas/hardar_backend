import { Injectable } from '@nestjs/common';

import { ComplaintsService } from '../../complaints/application/complaints.service.js';
import { ContractsService } from '../../contracts/application/contracts.service.js';
import { ConversationsService } from '../../conversations/application/conversations.service.js';
import type { ConversationStats } from '../../conversations/domain/conversation.repository.js';
import { KnowledgeService } from '../../knowledge/application/knowledge.service.js';
import { WorkersService, type ConsentCounts } from '../../workers/application/workers.service.js';

export interface AdminOverview {
  periodDays: number;
  workers: ConsentCounts & { total: number };
  conversations: ConversationStats;
  contractsRead: number;
  followUpsScheduled: number;
  knowledgeBase: { articles: number; verified: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** FR-15: usage, issue types and accuracy flags for the admin dashboard. */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly workers: WorkersService,
    private readonly conversations: ConversationsService,
    private readonly knowledge: KnowledgeService,
    private readonly contracts: ContractsService,
    private readonly complaints: ComplaintsService,
  ) {}

  async overview(periodDays: number, now = new Date()): Promise<AdminOverview> {
    const since = new Date(now.getTime() - periodDays * DAY_MS);
    const [consent, conversations, knowledge, contractsRead, followUpsScheduled] = await Promise.all([
      this.workers.consentCounts(),
      this.conversations.stats(since),
      this.knowledge.verificationStatus(),
      this.contracts.countRead(),
      this.complaints.countFollowUps(),
    ]);

    const total = Object.values(consent).reduce((sum, count) => sum + count, 0);
    return {
      periodDays,
      workers: { ...consent, total },
      conversations,
      contractsRead,
      followUpsScheduled,
      knowledgeBase: { articles: knowledge.total, verified: knowledge.verified },
    };
  }
}
