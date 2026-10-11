import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CalculatorsService } from '../../../calculators/application/calculators.service.js';
import { LABOUR_LAW } from '../../../calculators/domain/labour-law.constants.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import type { AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

const inputSchema = z.strictObject({
  basicMonthlySalary: z.number().positive().describe('Monthly BASIC salary in AED, excluding allowances'),
  startDate: isoDate.describe('Employment start date, YYYY-MM-DD'),
  endDate: isoDate.describe('Employment end date (or expected end date), YYYY-MM-DD'),
});

/** FR-8: end-of-service gratuity, computed by tested code. */
@Injectable()
export class CalculateGratuityTool implements AgentTool<typeof inputSchema> {
  readonly name = 'calculate_gratuity';
  readonly description =
    'Calculate end-of-service gratuity under UAE law from basic salary and employment dates. ' +
    'Always use this instead of calculating yourself.';
  readonly inputSchema = inputSchema;

  constructor(private readonly calculators: CalculatorsService) {}

  execute(input: z.infer<typeof inputSchema>): Promise<ToolOutput> {
    const result = this.calculators.gratuity(input);
    return Promise.resolve({
      result: { ...result, currency: 'AED' },
      citations: [`${LABOUR_LAW.reference}, ${result.articleRef}`],
      issueType: IssueType.EndOfService,
    });
  }
}
