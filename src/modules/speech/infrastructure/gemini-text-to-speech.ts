import { FinishReason, type GoogleGenAI } from '@google/genai';
import { Inject, Injectable } from '@nestjs/common';

import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { TextToSpeech, type Audio } from '../domain/speech.ports.js';

/** Long enough for any Haqdar reply (about 120 words), short enough to bound cost. */
export const TTS_MAX_CHARS = 2000;

/**
 * FR-3 on Gemini: a reply as a spoken voice note, in whatever language the text is in.
 * Only the text itself is sent: the model reads any instruction it is given aloud too.
 * Returns WAV (24 kHz mono 16-bit). WhatsApp needs Ogg/Opus, so this serves the website.
 */
@Injectable()
export class GeminiTextToSpeech implements TextToSpeech {
  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
  ) {}

  async synthesize(text: string): Promise<Audio | null> {
    if (!this.client || !this.settings.enabled) throw new LlmUnavailableError('Spoken replies');
    const script = text.trim().slice(0, TTS_MAX_CHARS);
    if (!script) return null;

    const response = await this.client.models.generateContent({
      model: this.settings.ttsModel,
      contents: [{ role: 'user', parts: [{ text: script }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.settings.ttsVoice } } },
      },
    });

    const candidate = response.candidates?.[0];
    const audio = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (candidate?.finishReason !== FinishReason.STOP || !audio?.data) return null;

    const data = Buffer.from(audio.data, 'base64');
    return { data: isWav(data) ? data : wavFromPcm(data, sampleRateOf(audio.mimeType)), mimeType: 'audio/wav' };
  }
}

const isWav = (data: Buffer) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';

/** Raw PCM arrives as e.g. `audio/L16;codec=pcm;rate=24000`. */
function sampleRateOf(mimeType: string | undefined): number {
  const rate = Number(/rate=(\d+)/.exec(mimeType ?? '')?.[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
}

/** Wraps raw 16-bit mono PCM in a WAV header so browsers can play it. */
export function wavFromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
