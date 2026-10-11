import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkersService } from './application/workers.service.js';
import { Worker } from './domain/worker.entity.js';
import { WorkerRepository } from './domain/worker.repository.js';
import { TypeOrmWorkerRepository } from './infrastructure/typeorm-worker.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([Worker])],
  providers: [WorkersService, { provide: WorkerRepository, useClass: TypeOrmWorkerRepository }],
  exports: [WorkersService],
})
export class WorkersModule {}
