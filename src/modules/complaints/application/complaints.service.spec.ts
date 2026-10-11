import { aComplaintCase } from '../../../../test/support/builders.js';
import type { ComplaintCase } from '../domain/complaint-case.entity.js';
import type { ComplaintCaseRepository } from '../domain/complaint-case.repository.js';
import { ISSUE_TYPES, IssueType } from '../domain/issue-type.enum.js';
import { ComplaintsService, MAX_FOLLOW_UP_DAYS } from './complaints.service.js';

function setup() {
  const repository = {
    create: vi.fn(async (data: Partial<ComplaintCase>) => aComplaintCase(data)),
    findDueFollowUps: vi.fn(),
    save: vi.fn(),
    count: vi.fn().mockResolvedValue(4),
  } satisfies ComplaintCaseRepository;
  return { repository, service: new ComplaintsService(repository) };
}

describe('ComplaintsService', () => {
  it('has a guide with documents, steps and the MOHRE call centre for every issue type', () => {
    const { service } = setup();

    expect(service.allGuides().map((guide) => guide.issueType)).toEqual(ISSUE_TYPES);
    for (const issueType of ISSUE_TYPES) {
      const guide = service.guideFor(issueType);
      expect(guide.documents.length).toBeGreaterThan(0);
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.channels.map((channel) => channel.detail)).toContain('600590000');
    }
  });

  it('adds issue-specific documents to the common ones', () => {
    const { service } = setup();
    expect(service.guideFor(IssueType.UnpaidOvertime).documents).toContain(
      'Record of extra hours worked (dates and times)',
    );
  });

  it('counts the follow-ups workers agreed to', async () => {
    await expect(setup().service.countFollowUps()).resolves.toBe(4);
  });

  it('schedules a follow-up the given number of days from now', async () => {
    const { repository, service } = setup();
    const now = new Date('2026-10-01T09:00:00Z');

    await service.scheduleFollowUp('worker-1', IssueType.UnpaidSalary, 7, now);

    expect(repository.create).toHaveBeenCalledWith({
      workerId: 'worker-1',
      issueType: IssueType.UnpaidSalary,
      followUpAt: new Date('2026-10-08T09:00:00Z'),
    });
  });

  it.each([
    [0, 1],
    [2.6, 3],
    [365, MAX_FOLLOW_UP_DAYS],
  ])('keeps a requested %s days within 1–30 days (%s)', async (requested, expectedDays) => {
    const { repository, service } = setup();
    const now = new Date('2026-10-01T00:00:00Z');

    await service.scheduleFollowUp('worker-1', IssueType.Other, requested, now);

    const { followUpAt } = repository.create.mock.calls[0][0];
    expect(followUpAt!.getTime() - now.getTime()).toBe(expectedDays * 24 * 60 * 60 * 1000);
  });
});
