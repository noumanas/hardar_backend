import { aContractSummary, contractTerms } from '../../../../test/support/builders.js';
import type { ContractExtractor } from '../domain/contract-extractor.port.js';
import type { ContractSummary } from '../domain/contract-summary.entity.js';
import type { ContractSummaryRepository } from '../domain/contract-summary.repository.js';
import { ContractFlagCode } from '../domain/contract-terms.js';
import { ContractsService } from './contracts.service.js';

function setup() {
  const extractor = { extract: vi.fn() } satisfies ContractExtractor;
  const summaries = {
    create: vi.fn(async (data: Partial<ContractSummary>) => aContractSummary(data)),
    findLatestForWorker: vi.fn(),
    count: vi.fn().mockResolvedValue(94),
  } satisfies ContractSummaryRepository;
  return { extractor, summaries, service: new ContractsService(extractor, summaries) };
}

const image = { data: Buffer.from('jpeg'), mimeType: 'image/jpeg' };

describe('ContractsService', () => {
  it('stores nothing when the photo is not legible', async () => {
    const { extractor, summaries, service } = setup();
    extractor.extract.mockResolvedValue({ legible: false, terms: contractTerms() });

    await expect(service.read('worker-1', image)).resolves.toEqual({ legible: false });
    expect(summaries.create).not.toHaveBeenCalled();
  });

  it('checks the extracted terms against the law and remembers the summary', async () => {
    const { extractor, summaries, service } = setup();
    const terms = contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4 });
    extractor.extract.mockResolvedValue({ legible: true, terms });

    const reading = await service.read('worker-1', image);

    expect(extractor.extract).toHaveBeenCalledWith(image);
    expect(summaries.create).toHaveBeenCalledWith({
      workerId: 'worker-1',
      terms,
      flags: [expect.objectContaining({ code: ContractFlagCode.HoursPerDayAboveLimit })],
    });
    expect(reading).toMatchObject({ legible: true, summary: { workerId: 'worker-1' } });
  });

  it('examines a contract without saving it', async () => {
    const { extractor, summaries, service } = setup();
    const terms = contractTerms({ probationMonths: 9 });
    extractor.extract.mockResolvedValueOnce({ legible: true, terms });

    await expect(service.examine(image)).resolves.toEqual({
      legible: true,
      terms,
      flags: [expect.objectContaining({ code: ContractFlagCode.ProbationTooLong })],
    });
    extractor.extract.mockResolvedValueOnce({ legible: false, terms: contractTerms() });
    await expect(service.examine(image)).resolves.toEqual({ legible: false });
    expect(summaries.create).not.toHaveBeenCalled();
  });

  it('counts the contracts read', async () => {
    await expect(setup().service.countRead()).resolves.toBe(94);
  });

  it('returns the latest saved summary', async () => {
    const { summaries, service } = setup();
    summaries.findLatestForWorker.mockResolvedValue(aContractSummary());

    await expect(service.latestFor('worker-1')).resolves.toMatchObject({ id: 'summary-1' });
  });
});
