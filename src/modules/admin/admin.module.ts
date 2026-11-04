import { Module } from '@nestjs/common';

import { ComplaintsModule } from '../complaints/complaints.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { WorkersModule } from '../workers/workers.module.js';
import { AdminOverviewService } from './application/admin-overview.service.js';
import { WhatsAppContactsService } from './application/whatsapp-contacts.service.js';
import { AdminController } from './presentation/admin.controller.js';
import { AdminWhatsAppController } from './presentation/admin-whatsapp.controller.js';

@Module({
  imports: [WorkersModule, ConversationsModule, KnowledgeModule, ContractsModule, ComplaintsModule],
  controllers: [AdminController, AdminWhatsAppController],
  providers: [AdminOverviewService, WhatsAppContactsService],
})
export class AdminModule {}
