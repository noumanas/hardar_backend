import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ComplaintsService } from '../../../complaints/application/complaints.service.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import type { AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const inputSchema = z.strictObject({
  issueType: z.enum(IssueType).describe("The worker's problem"),
});

/** FR-10: documents, steps and MOHRE contact options for a complaint. */
@Injectable()
export class GetComplaintGuideTool implements AgentTool<typeof inputSchema> {
  readonly name = 'get_complaint_guide';
  readonly description =
    'Get the official MOHRE complaint guide for a problem: the worker’s right, documents to prepare, ' +
    'steps to file, and contact options.';
  readonly inputSchema = inputSchema;

  constructor(private readonly complaints: ComplaintsService) {}

  execute({ issueType }: z.infer<typeof inputSchema>): Promise<ToolOutput> {
    return Promise.resolve({ result: this.complaints.guideFor(issueType), issueType });
  }
}
