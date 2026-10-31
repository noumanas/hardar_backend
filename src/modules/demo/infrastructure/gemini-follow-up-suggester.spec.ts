import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';

import { testConfig } from '../../../../test/support/test-config.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { GeminiFollowUpSuggester } from './gemini-follow-up-suggester.js';

function setup(text: string | undefined, finishReason = FinishReason.STOP) {
  const generateContent = vi.fn().mockResolvedValue({ text, candidates: [{ finishReason }] });
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  return { generateContent, suggester: new GeminiFollowUpSuggester(client, new LlmSettings(testConfig())) };
}

const json = (questions: unknown) => JSON.stringify({ questions });

describe('GeminiFollowUpSuggester', () => {
  it('asks for follow-ups in the answer’s language as JSON, with low thinking', async () => {
    const { generateContent, suggester } = setup(
      json(['How is overtime calculated?', 'How do I complain to MOHRE?', 'Can they deduct my salary?']),
    );

    await expect(suggester.suggest('My salary is late', 'Your employer must pay through WPS.')).resolves.toEqual([
      'How is overtime calculated?',
      'How do I complain to MOHRE?',
      'Can they deduct my salary?',
    ]);

    const request = generateContent.mock.calls[0][0];
    expect(request.contents[0].parts[0].text).toBe(
      'Worker asked:\nMy salary is late\n\nHaqdar answered:\nYour employer must pay through WPS.',
    );
    expect(request.config).toMatchObject({
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(request.config.systemInstruction).toContain('same language and script');
  });

  it('keeps at most three short, distinct questions', async () => {
    const { suggester } = setup(
      json(['  Is   this legal? ', 'Is this legal?', 'x'.repeat(71), 42, '', 'What next?', 'Who pays?', 'Extra?']),
    );
    await expect(suggester.suggest('q', 'a')).resolves.toEqual(['Is this legal?', 'What next?', 'Who pays?']);
  });

  it.each([
    ['no text', undefined],
    ['text that is not JSON', 'How is overtime calculated?'],
    ['JSON without questions', json(undefined)],
  ])('returns nothing for %s', async (_, text) => {
    await expect(setup(text).suggester.suggest('q', 'a')).resolves.toEqual([]);
  });

  it('returns nothing for a blocked answer', async () => {
    await expect(setup(json(['Why?']), FinishReason.SAFETY).suggester.suggest('q', 'a')).resolves.toEqual([]);
  });

  it('refuses to run without a configured model', async () => {
    const suggester = new GeminiFollowUpSuggester(null, new LlmSettings(testConfig()));
    await expect(suggester.suggest('q', 'a')).rejects.toThrow(LlmUnavailableError);
  });
});
