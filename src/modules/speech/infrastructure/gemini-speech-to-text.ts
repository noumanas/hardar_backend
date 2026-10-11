import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { toJsonSchema } from '../../llm/json-schema.js';
import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { isSilentWav } from '../domain/audio-level.js';
import { SpeechToText, type Audio } from '../domain/speech.ports.js';

/** Audio formats Gemini accepts. WhatsApp voice notes are Ogg/Opus; the website sends WAV. */
export const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/flac',
  'audio/aiff',
]);

const TranscriptSchema = z.object({
  speech: z.boolean().describe('False if there is no clear human speech (silence, noise, music)'),
  transcript: z.string().describe('What was said, word for word, in the language and script it was spoken in'),
});

const RESPONSE_SCHEMA = toJsonSchema(TranscriptSchema);

const SYSTEM_INSTRUCTION = `You transcribe short voice notes from migrant workers in the United Arab Emirates.
Write down exactly what is said, in the language it is spoken in. Do not translate, summarise, correct or answer it.
Use each language's own script: Urdu in Urdu script (not Roman Urdu), Hindi in Devanagari, Bengali in Bengali script, Nepali in Devanagari, Malayalam in Malayalam script, Arabic in Arabic script. Tagalog and English in Latin script. Keep English words the speaker mixes in (salary, visa, company) as they said them.
If there is no clear speech, set speech to false and leave the transcript empty.`;

/**
 * FR-2 on Gemini: voice note to text, in any of the workers' languages. Used for WhatsApp
 * voice notes and the website demo. The audio is sent once and never stored.
 */
@Injectable()
export class GeminiSpeechToText implements SpeechToText {
  private readonly logger = new Logger(GeminiSpeechToText.name);

  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
  ) {}

  async transcribe(audio: Audio): Promise<string | null> {
    if (!this.client || !this.settings.enabled) throw new LlmUnavailableError('Voice notes');

    const mimeType = audio.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
      this.logger.warn(`Unsupported voice note format ${mimeType}`);
      return null;
    }

    // Speech models can invent words for silent audio, so a silent recording never reaches one.
    if (isSilentWav(audio.data)) return null;

    const response = await this.client.models.generateContent({
      model: this.settings.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audio.data.toString('base64') } },
            { text: 'Transcribe this voice note.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        // Transcription needs no reasoning; low thinking keeps the reply fast.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    if (response.candidates?.[0]?.finishReason !== FinishReason.STOP || !response.text) return null;

    const parsed = TranscriptSchema.safeParse(parseJson(response.text));
    if (!parsed.success) {
      this.logger.warn(`Gemini returned a transcript that does not match the schema: ${parsed.error.message}`);
      return null;
    }
    const transcript = parsed.data.transcript.trim();
    return parsed.data.speech && transcript ? transcript : null;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
