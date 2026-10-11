import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { Inject, Injectable } from '@nestjs/common';

import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { ReplyTranslator } from '../domain/reply-translator.port.js';

const SYSTEM_INSTRUCTION = `Translate the message into plain, simple English for a website visitor.
Keep every number, amount, phone number, article reference and organisation name (MOHRE, WPS) exactly as written.
Return only the translation: no quotes, notes or explanations.`;

/** One short, low-thinking Gemini call per answer. */
@Injectable()
export class GeminiReplyTranslator implements ReplyTranslator {
  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
  ) {}

  async toEnglish(text: string): Promise<string | null> {
    if (!this.client || !this.settings.enabled) throw new LlmUnavailableError('Translation');

    const response = await this.client.models.generateContent({
      model: this.settings.model,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: { systemInstruction: SYSTEM_INSTRUCTION, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    const translation = response.text?.trim();
    return response.candidates?.[0]?.finishReason === FinishReason.STOP && translation ? translation : null;
  }
}
