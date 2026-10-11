import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CalculatorsService } from '../../../calculators/application/calculators.service.js';
import { LABOUR_LAW } from '../../../calculators/domain/labour-law.constants.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import type { AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const hours = z.number().min(0).max(744);

const inputSchema = z.strictObject({
  basicMonthlySalary: z.number().positive().describe('Monthly BASIC salary in AED, excluding allowances'),
  normalOvertimeHours: hours.describe('Overtime hours worked outside 10pm–4am (0 if none)'),
  nightOvertimeHours: hours.describe('Overtime hours worked between 10pm and 4am (0 if none)'),
});

/** FR-9: overtime pay (+25% normal, +50% night), computed by tested code. */
@Injectable()
export class CalculateOvertimeTool implements AgentTool<typeof inputSchema> {
  readonly name = 'calculate_overtime';
  readonly description =
    'Calculate overtime pay owed under UAE law from basic salary and overtime hours. ' +
    'Always use this instead of calculating yourself.';
  readonly inputSchema = inputSchema;

  constructor(private readonly calculators: CalculatorsService) {}

  execute(input: z.infer<typeof inputSchema>): Promise<ToolOutput> {
    const result = this.calculators.overtime(input);
    return Promise.resolve({
      result: { ...result, currency: 'AED' },
      citations: [`${LABOUR_LAW.reference}, ${result.articleRef}`],
      issueType: IssueType.UnpaidOvertime,
    });
  }
}
