import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PageMetaDto, type Page } from '../../../common/dto/pagination.dto.js';
import { ConversationsService } from '../../conversations/application/conversations.service.js';
import type { WorkerActivity } from '../../conversations/domain/conversation.repository.js';
import type { Message } from '../../conversations/domain/message.entity.js';
import { WorkersService } from '../../workers/application/workers.service.js';
import type { Language } from '../../workers/domain/language.js';
import { formatPhone, normalizePhone } from '../../workers/domain/phone-number.js';
import type { ConsentStatus, Worker } from '../../workers/domain/worker.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A chat view shows at most this many of the latest messages. */
export const CHAT_MESSAGE_LIMIT = 200;

export interface WhatsAppContact {
  workerId: string;
  /** E.g. "+971 ••• 4567". The full number is only returned by `reveal`. */
  maskedPhone: string;
  language: Language | null;
  consentStatus: ConsentStatus;
  firstContactAt: Date;
  lastActiveAt: Date;
  conversationCount: number;
  messageCount: number;
  inboundCount: number;
  urgentCount: number;
  lastMessage: WorkerActivity['lastMessage'];
}

export interface WhatsAppSummary {
  periodDays: number;
  numbers: number;
  activeSince: number;
  consent: Record<ConsentStatus, number>;
  languages: Record<string, number>;
  inboundMessages: number;
  outboundMessages: number;
}

export interface WhatsAppChat {
  contact: WhatsAppContact;
  messages: Message[];
}

/**
 * The admin's view of the WhatsApp numbers that have messaged Haqdar. Numbers are masked;
 * an admin can reveal one deliberately, and every reveal is logged.
 */
@Injectable()
export class WhatsAppContactsService {
  private readonly logger = new Logger(WhatsAppContactsService.name);

  constructor(
    private readonly workers: WorkersService,
    private readonly conversations: ConversationsService,
  ) {}

  async summary(periodDays: number, now = new Date()): Promise<WhatsAppSummary> {
    const since = new Date(now.getTime() - periodDays * DAY_MS);
    const [consent, activeSince, languages, stats] = await Promise.all([
      this.workers.consentCounts(),
      this.workers.countActiveSince(since),
      this.workers.languageCounts(),
      this.conversations.stats(since),
    ]);
    return {
      periodDays,
      numbers: Object.values(consent).reduce((sum, count) => sum + count, 0),
      activeSince,
      consent,
      languages,
      inboundMessages: stats.inboundMessages,
      outboundMessages: stats.outboundMessages,
    };
  }

  /** Every number, most recently active first; or the one exact number an admin searched for. */
  async list(page: number, limit: number, phone?: string): Promise<Page<WhatsAppContact>> {
    if (phone) {
      const worker = await this.workers.findByPhone(normalizePhone(phone));
      const items = worker ? await this.toContacts([worker]) : [];
      return { items, meta: PageMetaDto.of(1, limit, items.length) };
    }

    const workers = await this.workers.list(page, limit);
    return { items: await this.toContacts(workers.items), meta: workers.meta };
  }

  async chat(workerId: string): Promise<WhatsAppChat> {
    const worker = await this.find(workerId);
    const [[contact], messages] = await Promise.all([
      this.toContacts([worker]),
      this.conversations.messagesOfWorker(workerId, CHAT_MESSAGE_LIMIT),
    ]);
    return { contact, messages };
  }

  /** The full number, for an admin who needs it. Logged, because it identifies a worker. */
  async reveal(workerId: string): Promise<{ phone: string }> {
    const worker = await this.find(workerId);
    this.logger.warn(`An admin revealed the WhatsApp number of worker ${workerId}`);
    return { phone: formatPhone(this.workers.phoneOf(worker)) };
  }

  private async find(workerId: string): Promise<Worker> {
    const worker = await this.workers.findById(workerId);
    if (!worker) throw new NotFoundException(`Worker ${workerId} not found`);
    return worker;
  }

  private async toContacts(workers: Worker[]): Promise<WhatsAppContact[]> {
    const activity = new Map(
      (await this.conversations.activityOf(workers.map((worker) => worker.id))).map((row) => [row.workerId, row]),
    );
    return workers.map((worker) => {
      const row = activity.get(worker.id);
      return {
        workerId: worker.id,
        maskedPhone: this.workers.maskedPhoneOf(worker),
        language: worker.language,
        consentStatus: worker.consentStatus,
        firstContactAt: worker.createdAt,
        lastActiveAt: worker.lastActiveAt,
        conversationCount: row?.conversationCount ?? 0,
        messageCount: row?.messageCount ?? 0,
        inboundCount: row?.inboundCount ?? 0,
        urgentCount: row?.urgentCount ?? 0,
        lastMessage: row?.lastMessage ?? null,
      };
    });
  }
}
