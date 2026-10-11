import { Module } from '@nestjs/common';

import { ComplaintsModule } from '../complaints/complaints.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { WorkersModule } from '../workers/workers.module.js';
import { AdminOverviewService } from './application/admin-overview.service.js';
import { AdminController } from './presentation/admin.controller.js';

@Module({
  imports: [WorkersModule, ConversationsModule, KnowledgeModule, ContractsModule, ComplaintsModule],
  controllers: [AdminController],
  providers: [AdminOverviewService],
})
export class AdminModule {}
