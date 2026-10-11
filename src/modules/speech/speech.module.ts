import type { GoogleGenAI } from '@google/genai';
import { Module } from '@nestjs/common';

import { GEMINI_CLIENT } from '../llm/llm.constants.js';
import { LlmSettings } from '../llm/llm-settings.js';
import { SpeechToText, TextToSpeech } from './domain/speech.ports.js';
import { GeminiSpeechToText } from './infrastructure/gemini-speech-to-text.js';
import { GeminiTextToSpeech } from './infrastructure/gemini-text-to-speech.js';
import { UnconfiguredSpeechToText, UnconfiguredTextToSpeech } from './infrastructure/unconfigured-speech.adapters.js';

/**
 * Voice notes are transcribed by Gemini when it is configured. WhatsApp replies stay text
 * until audio is converted to the Ogg/Opus WhatsApp requires; the website plays Gemini's
 * WAV voice notes through `GeminiTextToSpeech`, exported for the demo.
 */
export function createSpeechToText(client: GoogleGenAI | null, settings: LlmSettings): SpeechToText {
  return client && settings.enabled ? new GeminiSpeechToText(client, settings) : new UnconfiguredSpeechToText();
}

@Module({
  providers: [
    { provide: SpeechToText, inject: [GEMINI_CLIENT, LlmSettings], useFactory: createSpeechToText },
    { provide: TextToSpeech, useClass: UnconfiguredTextToSpeech },
    GeminiTextToSpeech,
  ],
  exports: [SpeechToText, TextToSpeech, GeminiTextToSpeech],
})
export class SpeechModule {}
