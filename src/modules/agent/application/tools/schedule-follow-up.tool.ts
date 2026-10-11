import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  ComplaintsService,
  MAX_FOLLOW_UP_DAYS,
  MIN_FOLLOW_UP_DAYS,
} from '../../../complaints/application/complaints.service.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import type { AgentContext, AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const inputSchema = z.strictObject({
  issueType: z.enum(IssueType).describe('The problem the worker is complaining about'),
  inDays: z
    .number()
    .int()
    .min(MIN_FOLLOW_UP_DAYS)
    .max(MAX_FOLLOW_UP_DAYS)
    .describe('Days from now to send the check-in message, usually 7'),
});

/** FR-13: schedules a check-in message, only after the worker agrees. */
@Injectable()
export class ScheduleFollowUpTool implements AgentTool<typeof inputSchema> {
  readonly name = 'schedule_follow_up';
  readonly description =
    'Schedule a WhatsApp check-in message to the worker about their complaint. ' +
    'Only call this after the worker has agreed to be contacted later.';
  readonly inputSchema = inputSchema;

  constructor(private readonly complaints: ComplaintsService) {}

  async execute({ issueType, inDays }: z.infer<typeof inputSchema>, context: AgentContext): Promise<ToolOutput> {
    const complaintCase = await this.complaints.scheduleFollowUp(context.workerId, issueType, inDays);
    return {
      result: { scheduled: true, followUpOn: complaintCase.followUpAt?.toISOString().slice(0, 10) },
      issueType,
    };
  }
}
