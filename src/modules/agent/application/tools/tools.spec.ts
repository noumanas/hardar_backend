import { aContractSummary, aLawArticle, aComplaintCase } from '../../../../../test/support/builders.js';
import { CalculatorsService } from '../../../calculators/application/calculators.service.js';
import { ComplaintsService } from '../../../complaints/application/complaints.service.js';
import type { ComplaintCaseRepository } from '../../../complaints/domain/complaint-case.repository.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import type { ContractsService } from '../../../contracts/application/contracts.service.js';
import type { KnowledgeService } from '../../../knowledge/application/knowledge.service.js';
import { CalculateGratuityTool } from './calculate-gratuity.tool.js';
import { CalculateOvertimeTool } from './calculate-overtime.tool.js';
import { GetComplaintGuideTool } from './get-complaint-guide.tool.js';
import { GetSavedContractTool } from './get-saved-contract.tool.js';
import { ScheduleFollowUpTool } from './schedule-follow-up.tool.js';
import { SearchLabourLawTool } from './search-labour-law.tool.js';

const context = { workerId: 'worker-1', conversationId: 'conversation-1' };

describe('agent tools', () => {
  describe('search_labour_law', () => {
    const search = vi.fn();
    const tool = new SearchLabourLawTool({ search } as unknown as KnowledgeService);

    it('returns matching articles and cites their references', async () => {
      search.mockResolvedValue([{ article: aLawArticle(), rank: 0.4 }]);

      await expect(tool.execute({ query: 'passport' })).resolves.toEqual({
        result: {
          found: true,
          articles: [
            {
              reference: 'Decree-Law 33/2021, Art. 13',
              title: 'Employer may not keep the passport',
              text: 'An employer may not keep a worker’s passport.',
              verified: false,
            },
          ],
        },
        citations: ['Decree-Law 33/2021, Art. 13'],
      });
    });

    it('tells the model to send the worker to MOHRE when nothing matches', async () => {
      search.mockResolvedValue([]);
      const { result } = await tool.execute({ query: 'visa for my cat' });
      expect(result).toMatchObject({ found: false, instruction: expect.stringContaining('600590000') });
    });

    it('rejects a too-short query in its schema', () => {
      expect(tool.inputSchema.safeParse({ query: 'a' }).success).toBe(false);
    });
  });

  describe('calculate_gratuity', () => {
    const tool = new CalculateGratuityTool(new CalculatorsService());

    it('returns the coded calculation with its legal reference', async () => {
      const output = await tool.execute({ basicMonthlySalary: 1500, startDate: '2019-03-01', endDate: '2025-03-01' });

      expect(output).toMatchObject({
        result: { amount: 6758.22, currency: 'AED', eligible: true },
        citations: ['Federal Decree-Law No. 33 of 2021, Art. 51'],
        issueType: IssueType.EndOfService,
      });
    });

    it('rejects a date that is not YYYY-MM-DD in its schema', () => {
      expect(
        tool.inputSchema.safeParse({ basicMonthlySalary: 1, startDate: '1/1/2020', endDate: '2025-01-01' }).success,
      ).toBe(false);
    });
  });

  describe('calculate_overtime', () => {
    it('returns the coded calculation with its legal reference', async () => {
      const tool = new CalculateOvertimeTool(new CalculatorsService());
      const output = await tool.execute({ basicMonthlySalary: 1500, normalOvertimeHours: 10, nightOvertimeHours: 4 });

      expect(output).toMatchObject({
        result: { totalOvertimePay: 115.63, currency: 'AED' },
        citations: ['Federal Decree-Law No. 33 of 2021, Art. 19'],
        issueType: IssueType.UnpaidOvertime,
      });
    });
  });

  describe('get_saved_contract', () => {
    const latestFor = vi.fn();
    const tool = new GetSavedContractTool({ latestFor } as unknown as ContractsService);

    it("returns the worker's saved contract terms", async () => {
      latestFor.mockResolvedValue(aContractSummary());

      const { result } = await tool.execute({}, context);

      expect(latestFor).toHaveBeenCalledWith('worker-1');
      expect(result).toMatchObject({
        found: true,
        terms: { basicMonthlySalary: 1500 },
        problems: [],
        readOn: '2026-10-01T10:00:00.000Z',
      });
    });

    it('says so when no contract was sent yet', async () => {
      latestFor.mockResolvedValue(null);
      await expect(tool.execute({}, context)).resolves.toEqual({ result: { found: false } });
    });
  });

  describe('get_complaint_guide', () => {
    it('returns the MOHRE guide and tags the issue', async () => {
      const tool = new GetComplaintGuideTool(new ComplaintsService({} as ComplaintCaseRepository));
      const output = await tool.execute({ issueType: IssueType.UnpaidSalary });

      expect(output.issueType).toBe(IssueType.UnpaidSalary);
      expect(output.result).toMatchObject({ title: 'Late or unpaid salary' });
    });

    it('only accepts known issue types', () => {
      const tool = new GetComplaintGuideTool(new ComplaintsService({} as ComplaintCaseRepository));
      expect(tool.inputSchema.safeParse({ issueType: 'visa' }).success).toBe(false);
    });
  });

  describe('schedule_follow_up', () => {
    it('schedules a check-in for the worker and reports the date', async () => {
      const scheduleFollowUp = vi
        .fn()
        .mockResolvedValue(aComplaintCase({ followUpAt: new Date('2026-10-08T09:00:00Z') }));
      const tool = new ScheduleFollowUpTool({ scheduleFollowUp } as unknown as ComplaintsService);

      const output = await tool.execute({ issueType: IssueType.UnpaidSalary, inDays: 7 }, context);

      expect(scheduleFollowUp).toHaveBeenCalledWith('worker-1', IssueType.UnpaidSalary, 7);
      expect(output).toEqual({
        result: { scheduled: true, followUpOn: '2026-10-08' },
        issueType: IssueType.UnpaidSalary,
      });
    });

    it('limits the delay to 1–30 days in its schema', () => {
      const tool = new ScheduleFollowUpTool({} as ComplaintsService);
      expect(tool.inputSchema.safeParse({ issueType: IssueType.Other, inDays: 90 }).success).toBe(false);
    });
  });
});
