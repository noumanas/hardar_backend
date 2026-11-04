import { aWorker } from '../../../../test/support/builders.js';
import { testConfig } from '../../../../test/support/test-config.js';
import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { ConsentStatus, type Worker } from '../domain/worker.entity.js';
import type { WorkerRepository } from '../domain/worker.repository.js';
import { WorkersService } from './workers.service.js';

function setup() {
  const repository = {
    findById: vi.fn(),
    findByPhoneHash: vi.fn(),
    create: vi.fn(async (data: Partial<Worker>) => aWorker({ ...data, consentStatus: ConsentStatus.Pending })),
    save: vi.fn(async (worker: Worker) => worker),
    delete: vi.fn(),
    countByConsent: vi.fn(),
    list: vi.fn(),
    countActiveSince: vi.fn(),
    countByLanguage: vi.fn(),
  } satisfies WorkerRepository;
  const crypto = new CryptoService(testConfig());
  return { repository, crypto, service: new WorkersService(repository, crypto) };
}

describe('WorkersService', () => {
  it('registers a first-time sender with a hashed and encrypted phone number', async () => {
    const { repository, crypto, service } = setup();
    repository.findByPhoneHash.mockResolvedValue(null);

    const { worker, isNew } = await service.findOrRegister('971500000001');

    expect(isNew).toBe(true);
    expect(worker.phoneHash).toBe(crypto.hash('971500000001'));
    expect(worker.phoneEncrypted).not.toContain('971500000001');
    expect(service.phoneOf(worker)).toBe('971500000001');
  });

  it('finds a returning worker and refreshes their last activity', async () => {
    const { repository, service } = setup();
    const existing = aWorker({ lastActiveAt: new Date('2020-01-01') });
    repository.findByPhoneHash.mockResolvedValue(existing);

    const { worker, isNew } = await service.findOrRegister('971500000001');

    expect(isNew).toBe(false);
    expect(worker.lastActiveAt.getFullYear()).toBeGreaterThan(2020);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    [true, ConsentStatus.Granted],
    [false, ConsentStatus.Declined],
  ])('records consent %s as %s with a timestamp', async (granted, status) => {
    const { service } = setup();
    const worker = await service.recordConsent(
      aWorker({ consentStatus: ConsentStatus.Pending, consentAt: null }),
      granted,
    );

    expect(worker.consentStatus).toBe(status);
    expect(worker.consentAt).toBeInstanceOf(Date);
  });

  it('deletes all data for a worker', async () => {
    const { repository, service } = setup();
    await service.deleteAllData(aWorker({ id: 'w-9' }));
    expect(repository.delete).toHaveBeenCalledWith('w-9');
  });

  it('passes through lookups and consent counts', async () => {
    const { repository, service } = setup();
    repository.findById.mockResolvedValue(aWorker());
    repository.countByConsent.mockResolvedValue({ pending: 1, granted: 2, declined: 0 });

    await expect(service.findById('worker-1')).resolves.toMatchObject({ id: 'worker-1' });
    await expect(service.consentCounts()).resolves.toEqual({ pending: 1, granted: 2, declined: 0 });
  });

  describe('for the admin WhatsApp page', () => {
    it("masks a worker's number and finds a worker by their full number through its hash", async () => {
      const { repository, crypto, service } = setup();
      const worker = aWorker({ phoneEncrypted: crypto.encrypt('971501234567') });
      repository.findByPhoneHash.mockResolvedValue(worker);

      expect(service.maskedPhoneOf(worker)).toBe('+971 ••• 4567');
      await expect(service.findByPhone('971501234567')).resolves.toBe(worker);
      expect(repository.findByPhoneHash).toHaveBeenCalledWith(crypto.hash('971501234567'));
    });

    it('pages workers and passes through activity and language counts', async () => {
      const { repository, service } = setup();
      repository.list.mockResolvedValue({ items: [aWorker()], total: 41 });
      repository.countActiveSince.mockResolvedValue(5);
      repository.countByLanguage.mockResolvedValue({ ur: 3, unset: 1 });
      const since = new Date('2026-10-01');

      await expect(service.list(3, 20)).resolves.toEqual({
        items: [expect.objectContaining({ id: 'worker-1' })],
        meta: { page: 3, limit: 20, total: 41, totalPages: 3 },
      });
      expect(repository.list).toHaveBeenCalledWith(40, 20);
      await expect(service.countActiveSince(since)).resolves.toBe(5);
      expect(repository.countActiveSince).toHaveBeenCalledWith(since);
      await expect(service.languageCounts()).resolves.toEqual({ ur: 3, unset: 1 });
    });

    it('saves or clears the language', async () => {
      const { repository, service } = setup();
      const worker = aWorker();

      await service.setLanguage(worker, 'bn');
      expect(worker.language).toBe('bn');
      await service.setLanguage(worker, null);
      expect(worker.language).toBeNull();
      expect(repository.save).toHaveBeenCalledTimes(2);
    });
  });
});
