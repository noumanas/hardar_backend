import type { ConsentStatus, Worker } from './worker.entity.js';

/** Workers per chosen language; `unset` counts those who have not picked one yet. */
export type LanguageCounts = Record<string, number>;

/** Persistence port for workers; the application layer depends on this, not on TypeORM. */
export abstract class WorkerRepository {
  abstract findById(id: string): Promise<Worker | null>;
  abstract findByPhoneHash(phoneHash: string): Promise<Worker | null>;
  abstract create(data: Pick<Worker, 'phoneHash' | 'phoneEncrypted'>): Promise<Worker>;
  abstract save(worker: Worker): Promise<Worker>;
  /** Deletes the worker and, through cascades, every conversation, contract and case they own. */
  abstract delete(id: string): Promise<void>;
  abstract countByConsent(): Promise<Record<ConsentStatus, number>>;
  /** Most recently active first. */
  abstract list(skip: number, take: number): Promise<{ items: Worker[]; total: number }>;
  abstract countActiveSince(since: Date): Promise<number>;
  abstract countByLanguage(): Promise<LanguageCounts>;
}
