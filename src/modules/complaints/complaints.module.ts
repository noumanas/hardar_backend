import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessagingModule } from '../messaging/messaging.module.js';
import { WorkersModule } from '../workers/workers.module.js';
import { ComplaintsService } from './application/complaints.service.js';
import { FollowUpScheduler } from './application/follow-up.scheduler.js';
import { ComplaintCase } from './domain/complaint-case.entity.js';
import { ComplaintCaseRepository } from './domain/complaint-case.repository.js';
import { TypeOrmComplaintCaseRepository } from './infrastructure/typeorm-complaint-case.repository.js';
import { ComplaintsController } from './presentation/complaints.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ComplaintCase]), WorkersModule, MessagingModule],
  controllers: [ComplaintsController],
  providers: [
    ComplaintsService,
    FollowUpScheduler,
    { provide: ComplaintCaseRepository, useClass: TypeOrmComplaintCaseRepository },
  ],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
