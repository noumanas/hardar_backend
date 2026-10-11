import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppConfigService } from '../../../config/app-config.service.js';
import { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import { WorkersService } from '../../workers/application/workers.service.js';
import { CaseStatus, type ComplaintCase } from '../domain/complaint-case.entity.js';
import { ComplaintCaseRepository } from '../domain/complaint-case.repository.js';

export const FOLLOW_UP_TEXT =
  'السلام علیکم! حقدار کی طرف سے یاد دہانی: کیا آپ نے MOHRE میں شکایت درج کر دی ہے اور شکایت نمبر محفوظ کر لیا ہے؟ مدد چاہیے تو یہاں جواب دیں۔';

const BATCH_SIZE = 50;

/** FR-13: sends the check-in message for every complaint case that is due. */
@Injectable()
export class FollowUpScheduler {
  private readonly logger = new Logger(FollowUpScheduler.name);
  private running = false;

  constructor(
    private readonly cases: ComplaintCaseRepository,
    private readonly workers: WorkersService,
    private readonly channel: MessagingChannel,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'complaint-follow-ups' })
  async sendDueFollowUps(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.cases.findDueFollowUps(now, BATCH_SIZE);
      let sent = 0;
      for (const complaintCase of due) {
        if (await this.followUp(complaintCase, now)) sent += 1;
      }
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async followUp(complaintCase: ComplaintCase, now: Date): Promise<boolean> {
    try {
      const worker = await this.workers.findById(complaintCase.workerId);
      if (!worker?.hasConsented) {
        complaintCase.status = CaseStatus.Closed;
        await this.cases.save(complaintCase);
        return false;
      }

      await this.deliver(this.workers.phoneOf(worker));
      complaintCase.status = CaseStatus.FollowUpSent;
      complaintCase.followUpSentAt = now;
      await this.cases.save(complaintCase);
      return true;
    } catch (error) {
      // Left open: the next run retries it.
      this.logger.error(`Follow-up for case ${complaintCase.id} failed`, error instanceof Error ? error.stack : error);
      return false;
    }
  }

  /**
   * Follow-ups arrive days later, outside WhatsApp's 24-hour reply window, so a
   * pre-approved template is used when configured; plain text only works inside the window.
   */
  private deliver(phone: string): Promise<void> {
    const template = this.config.get('WHATSAPP_FOLLOW_UP_TEMPLATE');
    return template
      ? this.channel.sendTemplate(phone, { name: template, language: this.config.get('WHATSAPP_TEMPLATE_LANGUAGE') })
      : this.channel.sendText(phone, FOLLOW_UP_TEXT);
  }
}
