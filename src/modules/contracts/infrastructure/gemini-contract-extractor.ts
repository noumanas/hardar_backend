import { FinishReason, MediaResolution, type GoogleGenAI } from '@google/genai';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { toJsonSchema } from '../../llm/json-schema.js';
import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { ContractExtractor, type ContractExtraction, type ContractImage } from '../domain/contract-extractor.port.js';
import type { ContractTerms } from '../domain/contract-terms.js';

/** Formats Gemini reads. WhatsApp sends contract photos as JPEG; scanned or emailed contracts come as PDF. */
const SUPPORTED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Inline files must stay well under Gemini's 20 MB request limit. */
export const MAX_CONTRACT_BYTES = 15 * 1024 * 1024;

const nullableNumber = (description: string) => z.number().nullable().describe(description);

const ExtractionSchema = z.object({
  legible: z.boolean().describe('False if the photo is too blurry, cut off or not a job contract or offer letter'),
  jobTitle: z.string().nullable(),
  basicMonthlySalary: nullableNumber('Monthly BASIC salary only, excluding allowances'),
  monthlyAllowances: nullableNumber('Sum of all monthly allowances (housing, transport, food, other)'),
  currency: z.string().nullable().describe('ISO currency code, usually AED'),
  workingHoursPerDay: nullableNumber('Normal working hours per day'),
  workingDaysPerWeek: nullableNumber('Working days per week'),
  annualLeaveDays: nullableNumber('Paid annual leave in days per year'),
  probationMonths: nullableNumber('Probation period in months'),
  noticePeriodDays: nullableNumber('Notice period in days'),
  startDate: z.string().nullable().describe('Contract start date as YYYY-MM-DD'),
  endDate: z.string().nullable().describe('Contract end date as YYYY-MM-DD'),
});

const RESPONSE_SCHEMA = toJsonSchema(ExtractionSchema);

const SYSTEM_INSTRUCTION = `You read UAE employment contracts and offer letters from photos for migrant workers.
Extract only what is written in the document. If a term is absent or unreadable, return null for it; never guess or infer a value.
Convert durations to the requested unit (for example "six months" probation -> 6, "one month" notice -> 30 days).
Dates must be YYYY-MM-DD.`;

/** FR-5: reads contract terms from a photo with Gemini vision and a JSON response schema. */
@Injectable()
export class GeminiContractExtractor implements ContractExtractor {
  private readonly logger = new Logger(GeminiContractExtractor.name);

  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
  ) {}

  async extract(image: ContractImage): Promise<ContractExtraction> {
    if (!this.client || !this.settings.enabled) throw new LlmUnavailableError('Contract reading');

    const mimeType = image.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!SUPPORTED_MEDIA_TYPES.has(mimeType) || image.data.length > MAX_CONTRACT_BYTES) return illegible();

    const response = await this.client.models.generateContent({
      model: this.settings.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: image.data.toString('base64') } },
            { text: 'Extract the key terms of this contract.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        // Contracts are dense, small print: Google recommends high resolution for document parsing.
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        thinkingConfig: { thinkingLevel: this.settings.thinkingLevel },
      },
    });

    if (response.candidates?.[0]?.finishReason !== FinishReason.STOP || !response.text) return illegible();

    const parsed = ExtractionSchema.safeParse(parseJson(response.text));
    if (!parsed.success) {
      this.logger.warn(`Gemini returned contract terms that do not match the schema: ${parsed.error.message}`);
      return illegible();
    }

    const { legible, ...terms } = parsed.data;
    return { legible, terms: sanitize(terms) };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const illegible = (): ContractExtraction => ({ legible: false, terms: emptyTerms() });

/** Drops impossible values so the domain never reasons over a misread number or date. */
export function sanitize(terms: ContractTerms): ContractTerms {
  const positive = (value: number | null): number | null =>
    value !== null && Number.isFinite(value) && value > 0 ? value : null;
  const isoDate = (value: string | null): string | null =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
  const text = (value: string | null): string | null => value?.trim() || null;

  return {
    jobTitle: text(terms.jobTitle),
    basicMonthlySalary: positive(terms.basicMonthlySalary),
    monthlyAllowances: terms.monthlyAllowances === 0 ? 0 : positive(terms.monthlyAllowances),
    currency: text(terms.currency)?.toUpperCase() ?? null,
    workingHoursPerDay: positive(terms.workingHoursPerDay),
    workingDaysPerWeek: positive(terms.workingDaysPerWeek),
    annualLeaveDays: positive(terms.annualLeaveDays),
    probationMonths: terms.probationMonths === 0 ? 0 : positive(terms.probationMonths),
    noticePeriodDays: positive(terms.noticePeriodDays),
    startDate: isoDate(terms.startDate),
    endDate: isoDate(terms.endDate),
  };
}

export function emptyTerms(): ContractTerms {
  return {
    jobTitle: null,
    basicMonthlySalary: null,
    monthlyAllowances: null,
    currency: null,
    workingHoursPerDay: null,
    workingDaysPerWeek: null,
    annualLeaveDays: null,
    probationMonths: null,
    noticePeriodDays: null,
    startDate: null,
    endDate: null,
  };
}
