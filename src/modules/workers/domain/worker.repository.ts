import type { ConsentStatus, Worker } from './worker.entity.js';

/** Persistence port for workers; the application layer depends on this, not on TypeORM. */
export abstract class WorkerRepository {
  abstract findById(id: string): Promise<Worker | null>;
  abstract findByPhoneHash(phoneHash: string): Promise<Worker | null>;
  abstract create(data: Pick<Worker, 'phoneHash' | 'phoneEncrypted'>): Promise<Worker>;
  abstract save(worker: Worker): Promise<Worker>;
  /** Deletes the worker and, through cascades, every conversation, contract and case they own. */
  abstract delete(id: string): Promise<void>;
  abstract countByConsent(): Promise<Record<ConsentStatus, number>>;
}
