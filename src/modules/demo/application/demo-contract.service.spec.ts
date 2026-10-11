import { BadRequestException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';

import { contractTerms } from '../../../../test/support/builders.js';
import type { ContractsService } from '../../contracts/application/contracts.service.js';
import { analyzeContract } from '../../contracts/domain/contract-analyzer.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { DemoContractService, type UploadedMedia } from './demo-contract.service.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')]);
const PDF = Buffer.from('%PDF-1.7\n%binary');

const photo = (buffer: Buffer, mimetype = 'image/jpeg'): UploadedMedia => ({ buffer, mimetype, size: buffer.length });

function setup() {
  const contracts = { examine: vi.fn() };
  return { contracts, service: new DemoContractService(contracts as unknown as ContractsService) };
}

describe('DemoContractService', () => {
  it('describes the stated terms and the flags the law checks raise', async () => {
    const { contracts, service } = setup();
    const terms = contractTerms({
      jobTitle: 'Mason',
      basicMonthlySalary: 1500,
      monthlyAllowances: null,
      currency: 'AED',
      workingHoursPerDay: 10,
      workingDaysPerWeek: 1,
      annualLeaveDays: 30,
      probationMonths: 1,
      noticePeriodDays: 30,
      startDate: '2026-01-01',
      endDate: null,
    });
    contracts.examine.mockResolvedValue({ legible: true, terms, flags: analyzeContract(terms) });

    const reading = await service.read(photo(JPEG));

    expect(contracts.examine).toHaveBeenCalledWith({ data: JPEG, mimeType: 'image/jpeg' });
    expect(reading).toEqual({
      legible: true,
      message: 'I read your contract. Here are the key terms. 2 things need your attention.',
      terms: [
        { label: 'Job title', value: 'Mason' },
        { label: 'Basic salary', value: 'AED 1,500 a month' },
        { label: 'Working hours', value: '10 hours a day' },
        { label: 'Working days', value: '1 day a week' },
        { label: 'Annual leave', value: '30 days a year' },
        { label: 'Probation', value: '1 month' },
        { label: 'Notice period', value: '30 days' },
        { label: 'Starts', value: '2026-01-01' },
      ],
      flags: [
        expect.objectContaining({ title: 'Daily working hours are above the legal limit', found: '10 hours a day' }),
        expect.objectContaining({ title: 'The contract has no end date', found: null }),
      ],
    });
  });

  it('says so when nothing needs attention, and defaults the currency to AED', async () => {
    const { contracts, service } = setup();
    const terms = contractTerms({ basicMonthlySalary: 2000, monthlyAllowances: 500, currency: null });
    contracts.examine.mockResolvedValue({ legible: true, terms, flags: [] });

    const reading = await service.read(photo(PNG, 'image/png'));

    expect(reading.message).toContain('Nothing in it goes against the labour law');
    expect(reading).toMatchObject({
      terms: expect.arrayContaining([{ label: 'Allowances', value: 'AED 500 a month' }]),
    });
  });

  it('notes a single flag in the singular', async () => {
    const { contracts, service } = setup();
    const terms = contractTerms({ endDate: null });
    contracts.examine.mockResolvedValue({ legible: true, terms, flags: analyzeContract(terms).slice(0, 1) });
    expect((await service.read(photo(WEBP, 'image/webp'))).message).toContain('1 thing needs your attention');
  });

  it('states each flagged value with its unit', async () => {
    const { contracts, service } = setup();
    const terms = contractTerms({
      workingHoursPerDay: 9,
      workingDaysPerWeek: 6,
      probationMonths: 9,
      annualLeaveDays: 20,
      noticePeriodDays: 100,
    });
    contracts.examine.mockResolvedValue({ legible: true, terms, flags: analyzeContract(terms) });

    const reading = await service.read(photo(JPEG));

    expect(reading.legible && reading.flags.map((flag) => flag.found)).toEqual([
      '9 hours a day',
      '54 hours a week',
      '9 months',
      '20 days a year',
      '100 days',
    ]);
  });

  it('asks for a clearer photo when the contract is unreadable', async () => {
    const { contracts, service } = setup();
    contracts.examine.mockResolvedValue({ legible: false });
    await expect(service.read(photo(HEIC, 'image/heic'))).resolves.toMatchObject({ legible: false });
  });

  it('reads a contract sent as a PDF', async () => {
    const { contracts, service } = setup();
    contracts.examine.mockResolvedValue({ legible: false });

    const reading = await service.read(photo(PDF, 'application/pdf'));

    expect(contracts.examine).toHaveBeenCalledWith({ data: PDF, mimeType: 'application/pdf' });
    expect(reading.message).toContain('this PDF');
  });

  it('requires a photo', async () => {
    const { service } = setup();
    await expect(service.read(undefined)).rejects.toThrow(BadRequestException);
    await expect(service.read(photo(Buffer.alloc(0)))).rejects.toThrow(BadRequestException);
  });

  it.each([
    ['a text file', photo(Buffer.from('hello'), 'text/plain')],
    ['a file whose bytes do not match its type', photo(Buffer.from('not really a jpeg'))],
  ])('refuses %s before calling the model', async (_, upload) => {
    const { contracts, service } = setup();
    await expect(service.read(upload)).rejects.toThrow(UnsupportedMediaTypeException);
    expect(contracts.examine).not.toHaveBeenCalled();
  });

  it.each([new LlmUnavailableError('Contract reading'), new Error('model timeout'), 'boom'])(
    'reports the service as unavailable when reading fails (%s)',
    async (failure) => {
      const { contracts, service } = setup();
      contracts.examine.mockRejectedValue(failure);
      await expect(service.read(photo(JPEG))).rejects.toThrow(ServiceUnavailableException);
    },
  );
});
