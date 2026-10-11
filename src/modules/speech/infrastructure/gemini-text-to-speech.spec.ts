import { FinishReason, type GoogleGenAI } from '@google/genai';

import { testConfig } from '../../../../test/support/test-config.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { GeminiTextToSpeech, TTS_MAX_CHARS, wavFromPcm } from './gemini-text-to-speech.js';

const spoken = (data: Buffer, mimeType: string, finishReason = FinishReason.STOP) => ({
  candidates: [{ finishReason, content: { parts: [{ inlineData: { data: data.toString('base64'), mimeType } }] } }],
});

function setup() {
  const generateContent = vi.fn();
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  return { generateContent, tts: new GeminiTextToSpeech(client, new LlmSettings(testConfig())) };
}

describe('GeminiTextToSpeech', () => {
  it('sends only the reply text to the TTS model, with the configured voice', async () => {
    const { generateContent, tts } = setup();
    const wav = wavFromPcm(Buffer.alloc(480), 24_000);
    generateContent.mockResolvedValue(spoken(wav, 'audio/wav'));

    await expect(tts.synthesize('  آپ کا حق  ')).resolves.toEqual({ data: wav, mimeType: 'audio/wav' });

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash-tts');
    // Nothing but the text: the model reads any instruction aloud too.
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'آپ کا حق' }] }]);
    expect(request.config).toEqual({
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    });
  });

  it('caps very long text', async () => {
    const { generateContent, tts } = setup();
    generateContent.mockResolvedValue(spoken(wavFromPcm(Buffer.alloc(2), 24_000), 'audio/wav'));
    await tts.synthesize('a'.repeat(TTS_MAX_CHARS + 500));
    expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).toHaveLength(TTS_MAX_CHARS);
  });

  it.each([
    ['audio/L16;codec=pcm;rate=16000', 16_000],
    ['audio/pcm', 24_000],
    [undefined, 24_000],
  ])('wraps raw PCM (%s) in a WAV header at %i Hz', async (mimeType, rate) => {
    const { generateContent, tts } = setup();
    const pcm = Buffer.alloc(320, 7);
    generateContent.mockResolvedValue(spoken(pcm, mimeType as string));

    const audio = await tts.synthesize('hello');

    expect(audio?.data.toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio?.data.readUInt32LE(24)).toBe(rate);
    expect(audio?.data.subarray(44)).toEqual(pcm);
  });

  it.each([
    ['blank text', '  ', null],
    ['a blocked answer', 'hi', spoken(Buffer.from('x'), 'audio/wav', FinishReason.SAFETY)],
    [
      'no audio part',
      'hi',
      { candidates: [{ finishReason: FinishReason.STOP, content: { parts: [{ text: 'hi' }] } }] },
    ],
  ])('returns null for %s', async (_, text, response) => {
    const { generateContent, tts } = setup();
    generateContent.mockResolvedValue(response);
    await expect(tts.synthesize(text)).resolves.toBeNull();
  });

  it('refuses to run without a configured model', async () => {
    const tts = new GeminiTextToSpeech(null, new LlmSettings(testConfig()));
    await expect(tts.synthesize('hi')).rejects.toThrow(LlmUnavailableError);
  });
});
