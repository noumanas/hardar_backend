import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { PageMetaDto, type Page } from '../../../common/dto/pagination.dto.js';
import type { Language } from '../domain/language.js';
import { ConsentStatus, type Worker } from '../domain/worker.entity.js';
import { maskPhone } from '../domain/phone-number.js';
import { WorkerRepository, type LanguageCounts } from '../domain/worker.repository.js';

export type ConsentCounts = Record<ConsentStatus, number>;

export interface WorkerLookup {
  worker: Worker;
  isNew: boolean;
}

@Injectable()
export class WorkersService {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    private readonly workers: WorkerRepository,
    private readonly crypto: CryptoService,
  ) {}

  /** Finds the worker behind a WhatsApp number, registering them on first contact. */
  async findOrRegister(phone: string): Promise<WorkerLookup> {
    const phoneHash = this.crypto.hash(phone);
    const existing = await this.workers.findByPhoneHash(phoneHash);
    if (existing) {
      existing.lastActiveAt = new Date();
      return { worker: await this.workers.save(existing), isNew: false };
    }

    const worker = await this.workers.create({ phoneHash, phoneEncrypted: this.crypto.encrypt(phone) });
    return { worker, isNew: true };
  }

  async findById(id: string): Promise<Worker | null> {
    return this.workers.findById(id);
  }

  async recordConsent(worker: Worker, granted: boolean): Promise<Worker> {
    worker.consentStatus = granted ? ConsentStatus.Granted : ConsentStatus.Declined;
    worker.consentAt = new Date();
    return this.workers.save(worker);
  }

  /** Saves the worker's language, or clears it (`null`) so the language menu is shown again. */
  async setLanguage(worker: Worker, language: Language | null): Promise<Worker> {
    worker.language = language;
    return this.workers.save(worker);
  }

  /** The phone number in clear, for sending follow-up messages. */
  phoneOf(worker: Worker): string {
    return this.crypto.decrypt(worker.phoneEncrypted);
  }

  /** The number as admins see it by default, e.g. "+971 ••• 4567". */
  maskedPhoneOf(worker: Worker): string {
    return maskPhone(this.phoneOf(worker));
  }

  /** Looks a worker up by their full number, through its hash: stored numbers are never searched in clear. */
  findByPhone(phone: string): Promise<Worker | null> {
    return this.workers.findByPhoneHash(this.crypto.hash(phone));
  }

  /** Every worker who has messaged Haqdar, most recently active first. */
  async list(page: number, limit: number): Promise<Page<Worker>> {
    const { items, total } = await this.workers.list((page - 1) * limit, limit);
    return { items, meta: PageMetaDto.of(page, limit, total) };
  }

  countActiveSince(since: Date): Promise<number> {
    return this.workers.countActiveSince(since);
  }

  languageCounts(): Promise<LanguageCounts> {
    return this.workers.countByLanguage();
  }

  consentCounts(): Promise<ConsentCounts> {
    return this.workers.countByConsent();
  }

  /** FR-14: removes the worker and everything stored about them. */
  async deleteAllData(worker: Worker): Promise<void> {
    await this.workers.delete(worker.id);
    this.logger.log(`Deleted all data for worker ${worker.id}`);
  }
}
