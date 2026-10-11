import { Injectable } from '@nestjs/common';

import { analyzeContract } from '../domain/contract-analyzer.js';
import { ContractExtractor, type ContractImage } from '../domain/contract-extractor.port.js';
import type { ContractSummary } from '../domain/contract-summary.entity.js';
import type { ContractFlag, ContractTerms } from '../domain/contract-terms.js';
import { ContractSummaryRepository } from '../domain/contract-summary.repository.js';

export type ContractReading = { legible: false } | { legible: true; summary: ContractSummary };

export type ContractExamination = { legible: false } | { legible: true; terms: ContractTerms; flags: ContractFlag[] };

@Injectable()
export class ContractsService {
  constructor(
    private readonly extractor: ContractExtractor,
    private readonly summaries: ContractSummaryRepository,
  ) {}

  /**
   * Flow B: read the photo, flag unlawful terms and remember the summary.
   * The image buffer is only held in memory for the duration of this call.
   */
  async read(workerId: string, image: ContractImage): Promise<ContractReading> {
    const examination = await this.examine(image);
    if (!examination.legible) return { legible: false };

    const summary = await this.summaries.create({ workerId, terms: examination.terms, flags: examination.flags });
    return { legible: true, summary };
  }

  /** Reads and checks a contract without saving anything (used by the public website demo). */
  async examine(image: ContractImage): Promise<ContractExamination> {
    const extraction = await this.extractor.extract(image);
    if (!extraction.legible) return { legible: false };
    return { legible: true, terms: extraction.terms, flags: analyzeContract(extraction.terms) };
  }

  latestFor(workerId: string): Promise<ContractSummary | null> {
    return this.summaries.findLatestForWorker(workerId);
  }

  /** Contracts read so far (each legible photo saves one summary). */
  countRead(): Promise<number> {
    return this.summaries.count();
  }
}
