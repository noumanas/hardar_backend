import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';

import { testConfig } from '../../../../test/support/test-config.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { GeminiReplyTranslator } from './gemini-reply-translator.js';

function setup(text: string | undefined, finishReason = FinishReason.STOP) {
  const generateContent = vi.fn().mockResolvedValue({ text, candidates: [{ finishReason }] });
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  return { generateContent, translator: new GeminiReplyTranslator(client, new LlmSettings(testConfig())) };
}

describe('GeminiReplyTranslator', () => {
  it('asks for a plain English translation with low thinking', async () => {
    const { generateContent, translator } = setup('  Call MOHRE on 600590000.  ');

    await expect(translator.toEnglish('MOHRE کو 600590000 پر کال کریں۔')).resolves.toBe('Call MOHRE on 600590000.');

    const request = generateContent.mock.calls[0][0];
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'MOHRE کو 600590000 پر کال کریں۔' }] }]);
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    expect(request.config.systemInstruction).toContain('Keep every number');
  });

  it.each([
    ['an empty answer', ''],
    ['no text', undefined],
  ])('returns null for %s', async (_, text) => {
    await expect(setup(text).translator.toEnglish('حقدار')).resolves.toBeNull();
  });

  it('returns null for a blocked answer', async () => {
    await expect(setup('x', FinishReason.SAFETY).translator.toEnglish('حقدار')).resolves.toBeNull();
  });

  it('refuses to run without a configured model', async () => {
    const translator = new GeminiReplyTranslator(null, new LlmSettings(testConfig()));
    await expect(translator.toEnglish('حقدار')).rejects.toThrow(LlmUnavailableError);
  });
});
