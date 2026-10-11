import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';

import { testConfig } from '../../../../test/support/test-config.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { createSpeechToText } from '../speech.module.js';
import { GeminiSpeechToText } from './gemini-speech-to-text.js';
import { UnconfiguredSpeechToText } from './unconfigured-speech.adapters.js';

const answer = (text: string, finishReason = FinishReason.STOP) => ({ text, candidates: [{ finishReason }] });

function setup() {
  const generateContent = vi.fn().mockResolvedValue(answer('{"speech":true,"transcript":" میری تنخواہ نہیں آئی "}'));
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  return { generateContent, stt: new GeminiSpeechToText(client, new LlmSettings(testConfig())) };
}

const voice = { data: Buffer.from('OggS-audio'), mimeType: 'audio/ogg; codecs=opus' };

describe('GeminiSpeechToText', () => {
  it('sends the audio once and returns the transcript in the language spoken', async () => {
    const { generateContent, stt } = setup();

    await expect(stt.transcribe(voice)).resolves.toBe('میری تنخواہ نہیں آئی');

    const request = generateContent.mock.calls[0][0];
    expect(request.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'audio/ogg', data: Buffer.from('OggS-audio').toString('base64') },
    });
    expect(request.config).toMatchObject({
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    expect(request.config.systemInstruction).toContain('Urdu in Urdu script');
  });

  it.each([
    ['no speech in the recording', answer('{"speech":false,"transcript":""}')],
    ['an empty transcript', answer('{"speech":true,"transcript":"  "}')],
    ['an answer that is not JSON', answer('sorry')],
    ['an answer that does not match the schema', answer('{"text":"hi"}')],
    ['a blocked answer', answer('{"speech":true,"transcript":"x"}', FinishReason.SAFETY)],
    ['no text at all', answer('')],
  ])('returns null for %s', async (_, response) => {
    const { generateContent, stt } = setup();
    generateContent.mockResolvedValue(response);
    await expect(stt.transcribe(voice)).resolves.toBeNull();
  });

  it('returns null for a format Gemini does not take, without calling it', async () => {
    const { generateContent, stt } = setup();
    await expect(stt.transcribe({ data: Buffer.from('x'), mimeType: 'video/webm' })).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('treats a silent WAV as no speech, without calling Gemini (models invent words for silence)', async () => {
    const { generateContent, stt } = setup();
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + 3200, 4);
    header.write('WAVEfmt ', 8, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16_000, 24);
    header.writeUInt32LE(32_000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(3200, 40);
    const silent = Buffer.concat([header, Buffer.alloc(3200)]);

    await expect(stt.transcribe({ data: silent, mimeType: 'audio/wav' })).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refuses to run without a configured model', async () => {
    const stt = new GeminiSpeechToText(null, new LlmSettings(testConfig()));
    await expect(stt.transcribe(voice)).rejects.toThrow(LlmUnavailableError);
  });
});

describe('createSpeechToText', () => {
  it('uses Gemini when it is configured, and the text-only fallback otherwise', () => {
    const client = { models: {} } as unknown as GoogleGenAI;
    expect(createSpeechToText(client, new LlmSettings(testConfig()))).toBeInstanceOf(GeminiSpeechToText);
    expect(createSpeechToText(null, new LlmSettings(testConfig()))).toBeInstanceOf(UnconfiguredSpeechToText);
  });
});
