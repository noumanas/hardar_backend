import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ContractSummary } from '../domain/contract-summary.entity.js';
import { ContractSummaryRepository } from '../domain/contract-summary.repository.js';

@Injectable()
export class TypeOrmContractSummaryRepository implements ContractSummaryRepository {
  constructor(@InjectRepository(ContractSummary) private readonly summaries: Repository<ContractSummary>) {}

  create(data: Pick<ContractSummary, 'workerId' | 'terms' | 'flags'>): Promise<ContractSummary> {
    return this.summaries.save(this.summaries.create(data));
  }

  findLatestForWorker(workerId: string): Promise<ContractSummary | null> {
    return this.summaries.findOne({ where: { workerId }, order: { createdAt: 'DESC' } });
  }

  count(): Promise<number> {
    return this.summaries.count();
  }
}
