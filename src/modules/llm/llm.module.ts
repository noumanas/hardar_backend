import { GoogleGenAI } from '@google/genai';
import { Global, Logger, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { GEMINI_CLIENT } from './llm.constants.js';
import { LlmSettings } from './llm-settings.js';

/** Voice replies must stay under 15 seconds end to end (PRD), so calls fail fast. */
const REQUEST_TIMEOUT_MS = 30_000;

export function createGeminiClient(settings: LlmSettings, config: AppConfigService): GoogleGenAI | null {
  if (!settings.enabled) {
    new Logger('LlmModule').warn('Gemini is not configured; the agent will send its fallback reply');
    return null;
  }
  return new GoogleGenAI({ apiKey: config.get('GEMINI_API_KEY'), httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
}

@Global()
@Module({
  providers: [
    LlmSettings,
    { provide: GEMINI_CLIENT, inject: [LlmSettings, AppConfigService], useFactory: createGeminiClient },
  ],
  exports: [LlmSettings, GEMINI_CLIENT],
})
export class LlmModule {}
