import { Logger } from '@nestjs/common';

import { aComplaintCase, aWorker } from '../../../../test/support/builders.js';
import { testConfig } from '../../../../test/support/test-config.js';
import type { Env } from '../../../config/env.schema.js';
import type { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus } from '../../workers/domain/worker.entity.js';
import { CaseStatus, type ComplaintCase } from '../domain/complaint-case.entity.js';
import type { ComplaintCaseRepository } from '../domain/complaint-case.repository.js';
import { FOLLOW_UP_TEXT, FollowUpScheduler } from './follow-up.scheduler.js';

const now = new Date('2026-10-08T09:00:00Z');

function setup(cases: ComplaintCase[], env: Partial<Env> = {}) {
  const repository = {
    create: vi.fn(),
    findDueFollowUps: vi.fn().mockResolvedValue(cases),
    save: vi.fn(async (complaintCase: ComplaintCase) => complaintCase),
    count: vi.fn(),
  } satisfies ComplaintCaseRepository;
  const workers = {
    findById: vi.fn().mockResolvedValue(aWorker()),
    phoneOf: vi.fn().mockReturnValue('971500000001'),
  } as unknown as WorkersService & { findById: ReturnType<typeof vi.fn> };
  const channel = {
    sendText: vi.fn(),
    sendTemplate: vi.fn(),
    sendAudio: vi.fn(),
    downloadMedia: vi.fn(),
  } satisfies MessagingChannel;
  const scheduler = new FollowUpScheduler(repository, workers, channel, testConfig(env));
  return { repository, workers, channel, scheduler };
}

describe('FollowUpScheduler', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('sends the Urdu check-in text and marks the case as followed up', async () => {
    const complaintCase = aComplaintCase();
    const { channel, repository, scheduler } = setup([complaintCase]);

    await expect(scheduler.sendDueFollowUps(now)).resolves.toBe(1);

    expect(repository.findDueFollowUps).toHaveBeenCalledWith(now, 50);
    expect(channel.sendText).toHaveBeenCalledWith('971500000001', FOLLOW_UP_TEXT);
    expect(complaintCase).toMatchObject({ status: CaseStatus.FollowUpSent, followUpSentAt: now });
  });

  it('uses the approved template when one is configured (outside the 24-hour window)', async () => {
    const { channel, scheduler } = setup([aComplaintCase()], { WHATSAPP_FOLLOW_UP_TEMPLATE: 'haqdar_follow_up' });

    await scheduler.sendDueFollowUps(now);

    expect(channel.sendTemplate).toHaveBeenCalledWith('971500000001', { name: 'haqdar_follow_up', language: 'ur' });
    expect(channel.sendText).not.toHaveBeenCalled();
  });

  it.each([
    ['the worker deleted their data', null],
    ['the worker withdrew consent', aWorker({ consentStatus: ConsentStatus.Declined })],
  ])('closes the case without messaging when %s', async (_case, worker) => {
    const complaintCase = aComplaintCase();
    const { channel, workers, scheduler } = setup([complaintCase]);
    workers.findById.mockResolvedValue(worker);

    await expect(scheduler.sendDueFollowUps(now)).resolves.toBe(0);

    expect(channel.sendText).not.toHaveBeenCalled();
    expect(complaintCase.status).toBe(CaseStatus.Closed);
  });

  it('leaves a case open to retry when sending fails, and carries on with the rest', async () => {
    const failing = aComplaintCase({ id: 'case-1' });
    const ok = aComplaintCase({ id: 'case-2' });
    const { channel, scheduler } = setup([failing, ok]);
    channel.sendText.mockRejectedValueOnce(new Error('WhatsApp down'));

    await expect(scheduler.sendDueFollowUps(now)).resolves.toBe(1);

    expect(failing.status).toBe(CaseStatus.Open);
    expect(ok.status).toBe(CaseStatus.FollowUpSent);
  });

  it('skips a run while the previous one is still going', async () => {
    const { repository, scheduler } = setup([]);
    let release!: () => void;
    repository.findDueFollowUps.mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([]))));

    const first = scheduler.sendDueFollowUps(now);
    await expect(scheduler.sendDueFollowUps(now)).resolves.toBe(0);
    release();
    await first;

    expect(repository.findDueFollowUps).toHaveBeenCalledOnce();
  });
});
