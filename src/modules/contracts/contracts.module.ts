import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContractsService } from './application/contracts.service.js';
import { ContractExtractor } from './domain/contract-extractor.port.js';
import { ContractSummary } from './domain/contract-summary.entity.js';
import { ContractSummaryRepository } from './domain/contract-summary.repository.js';
import { GeminiContractExtractor } from './infrastructure/gemini-contract-extractor.js';
import { TypeOrmContractSummaryRepository } from './infrastructure/typeorm-contract-summary.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([ContractSummary])],
  providers: [
    ContractsService,
    { provide: ContractExtractor, useClass: GeminiContractExtractor },
    { provide: ContractSummaryRepository, useClass: TypeOrmContractSummaryRepository },
  ],
  exports: [ContractsService],
})
export class ContractsModule {}
