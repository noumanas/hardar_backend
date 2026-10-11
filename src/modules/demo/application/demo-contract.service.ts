import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { ContractsService } from '../../contracts/application/contracts.service.js';
import { ContractFlagCode, type ContractFlag, type ContractTerms } from '../../contracts/domain/contract-terms.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';

/** A phone photo is a few MB; a scanned multi-page PDF can be more. */
export const DEMO_CONTRACT_MAX_BYTES = 10 * 1024 * 1024;

/** A file as multer hands it over (memory storage: it never touches the disk). */
export interface UploadedMedia {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface DemoContractTerm {
  label: string;
  value: string;
}

export interface DemoContractFlag {
  title: string;
  found: string | null;
  legalLimit: string;
  articleRef: string;
}

export type DemoContractReading =
  | { legible: false; message: string }
  | { legible: true; message: string; terms: DemoContractTerm[]; flags: DemoContractFlag[] };

/** Image signatures, checked so a renamed file of another type is refused before it reaches the model. */
const SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  'image/jpeg': (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/png': (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (data) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP',
  'image/heic': (data) => data.toString('ascii', 4, 8) === 'ftyp',
  'image/heif': (data) => data.toString('ascii', 4, 8) === 'ftyp',
  'application/pdf': (data) => data.toString('ascii', 0, 5) === '%PDF-',
};

const FLAG_TITLES: Record<ContractFlagCode, string> = {
  [ContractFlagCode.HoursPerDayAboveLimit]: 'Daily working hours are above the legal limit',
  [ContractFlagCode.HoursPerWeekAboveLimit]: 'Weekly working hours are above the legal limit',
  [ContractFlagCode.ProbationTooLong]: 'Probation is longer than the law allows',
  [ContractFlagCode.AnnualLeaveBelowMinimum]: 'Annual leave is less than the law requires',
  [ContractFlagCode.NoticePeriodOutOfRange]: 'Notice period is outside the legal range',
  [ContractFlagCode.BasicSalaryMissing]: 'Basic salary is not written in the contract',
  [ContractFlagCode.EndDateMissing]: 'The contract has no end date',
};

const money = (amount: number, currency: string | null) => `${currency ?? 'AED'} ${amount.toLocaleString('en-US')}`;
const count = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`;

/** Only the terms the contract states, in the order a worker cares about them. */
function describeTerms(terms: ContractTerms): DemoContractTerm[] {
  const rows: [string, string | null][] = [
    ['Job title', terms.jobTitle],
    [
      'Basic salary',
      terms.basicMonthlySalary === null ? null : `${money(terms.basicMonthlySalary, terms.currency)} a month`,
    ],
    [
      'Allowances',
      terms.monthlyAllowances === null ? null : `${money(terms.monthlyAllowances, terms.currency)} a month`,
    ],
    ['Working hours', terms.workingHoursPerDay === null ? null : `${count(terms.workingHoursPerDay, 'hour')} a day`],
    ['Working days', terms.workingDaysPerWeek === null ? null : `${count(terms.workingDaysPerWeek, 'day')} a week`],
    ['Annual leave', terms.annualLeaveDays === null ? null : `${count(terms.annualLeaveDays, 'day')} a year`],
    ['Probation', terms.probationMonths === null ? null : count(terms.probationMonths, 'month')],
    ['Notice period', terms.noticePeriodDays === null ? null : count(terms.noticePeriodDays, 'day')],
    ['Starts', terms.startDate],
    ['Ends', terms.endDate],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value }));
}

/** How a flagged value reads in a sentence ("10 hours a day"); weekly hours are already a total. */
const FOUND_UNITS: Partial<Record<keyof ContractTerms, (value: number) => string>> = {
  workingHoursPerDay: (value) => `${count(value, 'hour')} a day`,
  workingDaysPerWeek: (value) => `${count(value, 'hour')} a week`,
  probationMonths: (value) => count(value, 'month'),
  annualLeaveDays: (value) => `${count(value, 'day')} a year`,
  noticePeriodDays: (value) => count(value, 'day'),
};

const describeFound = ({ field, found }: ContractFlag): string | null => {
  if (found === null) return null;
  const withUnit = FOUND_UNITS[field];
  return typeof found === 'number' && withUnit ? withUnit(found) : String(found);
};

const describeFlag = (flag: ContractFlag): DemoContractFlag => ({
  title: FLAG_TITLES[flag.code],
  found: describeFound(flag),
  legalLimit: flag.legalLimit,
  articleRef: flag.articleRef,
});

/**
 * "Upload your contract" on the website demo: the same reading and legal checks as on WhatsApp,
 * but nothing is saved and the photo lives only in memory for the length of the request.
 */
@Injectable()
export class DemoContractService {
  private readonly logger = new Logger(DemoContractService.name);

  constructor(private readonly contracts: ContractsService) {}

  async read(photo: UploadedMedia | undefined): Promise<DemoContractReading> {
    if (!photo || photo.size === 0)
      throw new BadRequestException('Attach a photo or PDF of the contract as "contract"');

    const mimeType = photo.mimetype.toLowerCase();
    const matches = SIGNATURES[mimeType];
    if (!matches?.(photo.buffer)) {
      throw new UnsupportedMediaTypeException('Send the contract as a photo (JPG, PNG, WebP or HEIC) or a PDF');
    }

    let examination;
    try {
      examination = await this.contracts.examine({ data: photo.buffer, mimeType });
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        this.logger.error(`Demo contract reading failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new ServiceUnavailableException(
        "Contract reading isn't available in the demo right now. Please try later.",
      );
    }

    if (!examination.legible) {
      return {
        legible: false,
        message:
          mimeType === 'application/pdf'
            ? "I couldn't read the contract in this PDF. Check that it is your job contract or offer letter and that the pages are clear."
            : "I couldn't read this clearly. Take the photo in good light, flat, with the whole page in view.",
      };
    }

    const flags = examination.flags.map(describeFlag);
    return {
      legible: true,
      message:
        flags.length === 0
          ? 'I read your contract. Here are the key terms. Nothing in it goes against the labour law.'
          : `I read your contract. Here are the key terms. ${count(flags.length, 'thing')} need${flags.length === 1 ? 's' : ''} your attention.`,
      terms: describeTerms(examination.terms),
      flags,
    };
  }
}
