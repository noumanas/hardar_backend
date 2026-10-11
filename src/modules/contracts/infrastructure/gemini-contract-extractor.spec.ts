import { FinishReason, MediaResolution, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { Logger } from '@nestjs/common';

import { contractTerms } from '../../../../test/support/builders.js';
import { testConfig } from '../../../../test/support/test-config.js';
import type { Env } from '../../../config/env.schema.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { emptyTerms, GeminiContractExtractor, sanitize, MAX_CONTRACT_BYTES } from './gemini-contract-extractor.js';

/** A Gemini response whose `text` is the JSON the model produced. */
const jsonResponse = (body: unknown, finishReason = FinishReason.STOP) => ({
  candidates: [{ finishReason }],
  text: typeof body === 'string' ? body : JSON.stringify(body),
});

function setup(env: Partial<Env> = {}) {
  const generateContent = vi.fn();
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  const extractor = new GeminiContractExtractor(client, new LlmSettings(testConfig(env)));
  return { generateContent, extractor };
}

const photo = { data: Buffer.from('fake-jpeg'), mimeType: 'image/jpeg' };

describe('GeminiContractExtractor', () => {
  it('sends the photo with a JSON schema at high resolution and returns the parsed terms', async () => {
    const { generateContent, extractor } = setup();
    generateContent.mockResolvedValue(jsonResponse({ legible: true, ...contractTerms() }));

    await expect(extractor.extract(photo)).resolves.toEqual({ legible: true, terms: contractTerms() });

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash');
    expect(request.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: photo.data.toString('base64') },
    });
    expect(request.config).toMatchObject({
      responseMimeType: 'application/json',
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(request.config.responseJsonSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['legible', 'basicMonthlySalary', 'endDate']),
    });
  });

  it('accepts a media type with parameters', async () => {
    const { generateContent, extractor } = setup();
    generateContent.mockResolvedValue(jsonResponse({ legible: true, ...contractTerms() }));

    await extractor.extract({ ...photo, mimeType: 'IMAGE/PNG; charset=binary' });

    expect(generateContent.mock.calls[0][0].contents[0].parts[0].inlineData.mimeType).toBe('image/png');
  });

  it('reads a contract sent as a PDF', async () => {
    const { generateContent, extractor } = setup();
    generateContent.mockResolvedValue(jsonResponse({ legible: true, ...contractTerms() }));

    await extractor.extract({ data: Buffer.from('%PDF-1.7'), mimeType: 'application/pdf' });

    expect(generateContent.mock.calls[0][0].contents[0].parts[0].inlineData.mimeType).toBe('application/pdf');
  });

  it.each([
    ['an unsupported file type', { ...photo, mimeType: 'application/zip' }],
    ['a file too large to send inline', { data: Buffer.alloc(MAX_CONTRACT_BYTES + 1), mimeType: 'application/pdf' }],
  ])('treats %s as illegible without calling the model', async (_, file) => {
    const { generateContent, extractor } = setup();

    await expect(extractor.extract(file)).resolves.toEqual({ legible: false, terms: emptyTerms() });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    ['a blocked answer', jsonResponse({ legible: true, ...contractTerms() }, FinishReason.SAFETY)],
    ['an empty answer', { candidates: [{ finishReason: FinishReason.STOP }], text: undefined }],
    ['malformed JSON', jsonResponse('{"legible": tru')],
  ])('treats %s as illegible', async (_case, response) => {
    const { generateContent, extractor } = setup();
    generateContent.mockResolvedValue(response);

    await expect(extractor.extract(photo)).resolves.toMatchObject({ legible: false });
  });

  it('treats JSON that breaks the schema as illegible and logs it', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { generateContent, extractor } = setup();
    generateContent.mockResolvedValue(jsonResponse({ legible: 'yes' }));

    await expect(extractor.extract(photo)).resolves.toMatchObject({ legible: false });
    expect(warn).toHaveBeenCalled();
  });

  it('refuses to run when no LLM is configured', async () => {
    const { extractor } = setup({ AGENT_LLM_PROVIDER: 'none' });
    await expect(extractor.extract(photo)).rejects.toThrow(LlmUnavailableError);
    await expect(new GeminiContractExtractor(null, new LlmSettings(testConfig())).extract(photo)).rejects.toThrow(
      LlmUnavailableError,
    );
  });
});

describe('sanitize', () => {
  it('drops impossible numbers and malformed dates, and normalises text', () => {
    expect(
      sanitize(
        contractTerms({
          jobTitle: '  ',
          basicMonthlySalary: -5,
          workingHoursPerDay: Number.NaN,
          currency: 'aed',
          startDate: '01/01/2025',
          endDate: '2027-13-45',
        }),
      ),
    ).toMatchObject({
      jobTitle: null,
      basicMonthlySalary: null,
      workingHoursPerDay: null,
      currency: 'AED',
      startDate: null,
      endDate: null,
    });
  });

  it('keeps legitimate zero values for allowances and probation', () => {
    expect(sanitize(contractTerms({ monthlyAllowances: 0, probationMonths: 0 }))).toMatchObject({
      monthlyAllowances: 0,
      probationMonths: 0,
    });
  });

  it('keeps a missing currency as null', () => {
    expect(sanitize(contractTerms({ currency: null })).currency).toBeNull();
  });
});
