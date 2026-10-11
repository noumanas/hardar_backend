import type { ContractSummary } from './contract-summary.entity.js';

export abstract class ContractSummaryRepository {
  abstract create(data: Pick<ContractSummary, 'workerId' | 'terms' | 'flags'>): Promise<ContractSummary>;
  abstract findLatestForWorker(workerId: string): Promise<ContractSummary | null>;
  abstract count(): Promise<number>;
}
