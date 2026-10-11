import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ContractsService } from '../../../contracts/application/contracts.service.js';
import type { AgentContext, AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const inputSchema = z.strictObject({});

/** FR-12: lets the agent reuse the worker's contract instead of asking again. */
@Injectable()
export class GetSavedContractTool implements AgentTool<typeof inputSchema> {
  readonly name = 'get_saved_contract';
  readonly description =
    "Get the key terms of the worker's contract from the last photo they sent (salary, hours, dates...). " +
    'Use it before asking the worker for salary or dates.';
  readonly inputSchema = inputSchema;

  constructor(private readonly contracts: ContractsService) {}

  async execute(_input: z.infer<typeof inputSchema>, context: AgentContext): Promise<ToolOutput> {
    const summary = await this.contracts.latestFor(context.workerId);
    if (!summary) return { result: { found: false } };
    return {
      result: { found: true, terms: summary.terms, problems: summary.flags, readOn: summary.createdAt.toISOString() },
    };
  }
}
