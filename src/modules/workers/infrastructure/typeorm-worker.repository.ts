import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';

import { ConsentStatus, Worker } from '../domain/worker.entity.js';
import { WorkerRepository, type LanguageCounts } from '../domain/worker.repository.js';

@Injectable()
export class TypeOrmWorkerRepository implements WorkerRepository {
  constructor(@InjectRepository(Worker) private readonly workers: Repository<Worker>) {}

  findById(id: string): Promise<Worker | null> {
    return this.workers.findOneBy({ id });
  }

  findByPhoneHash(phoneHash: string): Promise<Worker | null> {
    return this.workers.findOneBy({ phoneHash });
  }

  create(data: Pick<Worker, 'phoneHash' | 'phoneEncrypted'>): Promise<Worker> {
    return this.workers.save(this.workers.create(data));
  }

  save(worker: Worker): Promise<Worker> {
    return this.workers.save(worker);
  }

  async delete(id: string): Promise<void> {
    await this.workers.delete({ id });
  }

  async countByConsent(): Promise<Record<ConsentStatus, number>> {
    const rows = await this.workers
      .createQueryBuilder('w')
      .select('w.consent_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('w.consent_status')
      .getRawMany<{ status: ConsentStatus; count: string }>();

    const counts = { [ConsentStatus.Pending]: 0, [ConsentStatus.Granted]: 0, [ConsentStatus.Declined]: 0 };
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async list(skip: number, take: number): Promise<{ items: Worker[]; total: number }> {
    const [items, total] = await this.workers.findAndCount({ order: { lastActiveAt: 'DESC' }, skip, take });
    return { items, total };
  }

  countActiveSince(since: Date): Promise<number> {
    return this.workers.countBy({ lastActiveAt: MoreThanOrEqual(since) });
  }

  async countByLanguage(): Promise<LanguageCounts> {
    const rows = await this.workers
      .createQueryBuilder('w')
      .select(`COALESCE(w.language, 'unset')`, 'language')
      .addSelect('COUNT(*)', 'count')
      .groupBy('w.language')
      .getRawMany<{ language: string; count: string }>();
    return Object.fromEntries(rows.map((row) => [row.language, Number(row.count)]));
  }
}
