import type { GoogleGenAI } from '@google/genai';
import { Logger, Module } from '@nestjs/common';

import { GEMINI_CLIENT } from '../llm/llm.constants.js';
import { LlmSettings } from '../llm/llm-settings.js';
import { SpeechToText, TextToSpeech } from './domain/speech.ports.js';
import { BUNDLED_FFMPEG_PATH } from './infrastructure/bundled-ffmpeg.js';
import { GeminiSpeechToText } from './infrastructure/gemini-speech-to-text.js';
import { GeminiTextToSpeech } from './infrastructure/gemini-text-to-speech.js';
import { OggOpusEncoder } from './infrastructure/ogg-opus.encoder.js';
import { UnconfiguredSpeechToText, UnconfiguredTextToSpeech } from './infrastructure/unconfigured-speech.adapters.js';
import { VoiceNoteTextToSpeech } from './infrastructure/voice-note.text-to-speech.js';

/**
 * Voice notes are transcribed by Gemini when it is configured. WhatsApp replies are spoken
 * by Gemini and converted to the Ogg/Opus voice-note format with the bundled ffmpeg; the
 * website plays Gemini's WAV directly through `GeminiTextToSpeech`, exported for the demo.
 */
export function createSpeechToText(client: GoogleGenAI | null, settings: LlmSettings): SpeechToText {
  return client && settings.enabled ? new GeminiSpeechToText(client, settings) : new UnconfiguredSpeechToText();
}

export function createVoiceNotes(
  gemini: TextToSpeech,
  settings: LlmSettings,
  ffmpeg: string | null = BUNDLED_FFMPEG_PATH,
): TextToSpeech {
  if (!settings.enabled) return new UnconfiguredTextToSpeech();
  if (!ffmpeg) {
    new Logger('SpeechModule').warn('ffmpeg is not available for this platform; WhatsApp replies will be text only');
    return new UnconfiguredTextToSpeech();
  }
  return new VoiceNoteTextToSpeech(gemini, new OggOpusEncoder(ffmpeg));
}

@Module({
  providers: [
    { provide: SpeechToText, inject: [GEMINI_CLIENT, LlmSettings], useFactory: createSpeechToText },
    GeminiTextToSpeech,
    {
      provide: TextToSpeech,
      inject: [GeminiTextToSpeech, LlmSettings],
      useFactory: (gemini: GeminiTextToSpeech, settings: LlmSettings) => createVoiceNotes(gemini, settings),
    },
  ],
  exports: [SpeechToText, TextToSpeech, GeminiTextToSpeech],
})
export class SpeechModule {}
