import { FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { Inject, Injectable } from '@nestjs/common';

import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { FollowUpSuggester, MAX_FOLLOW_UPS } from '../domain/follow-up-suggester.port.js';

/** Long enough for "How do I file a complaint with MOHRE?" in any script; longer chips wrap badly. */
const MAX_LENGTH = 70;

const SYSTEM_INSTRUCTION = `You suggest what a migrant worker in the UAE might ask Haqdar next, after Haqdar's answer.
Haqdar can: explain UAE labour rights, calculate end-of-service gratuity and overtime pay, read a job contract, and guide a MOHRE complaint step by step.
Write 3 short follow-up questions that build on this answer, as the worker would ask them: first person, at most 8 words each, no numbering.
Use exactly the same language and script as Haqdar's answer.
Only suggest questions Haqdar can help with. Never suggest questions about the worker's name, ID or other personal details.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { questions: { type: 'array', items: { type: 'string' } } },
  required: ['questions'],
};

/** One short, low-thinking Gemini call per answer, run alongside the translation. */
@Injectable()
export class GeminiFollowUpSuggester implements FollowUpSuggester {
  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
  ) {}

  async suggest(question: string, answer: string): Promise<string[]> {
    if (!this.client || !this.settings.enabled) throw new LlmUnavailableError('Follow-up suggestions');

    const response = await this.client.models.generateContent({
      model: this.settings.model,
      contents: [{ role: 'user', parts: [{ text: `Worker asked:\n${question}\n\nHaqdar answered:\n${answer}` }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    if (response.candidates?.[0]?.finishReason !== FinishReason.STOP || !response.text) return [];
    return cleanQuestions(response.text);
  }
}

function cleanQuestions(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const questions = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return [];

  const unique = new Set<string>();
  for (const question of questions) {
    if (typeof question !== 'string') continue;
    const trimmed = question.replace(/\s+/g, ' ').trim();
    if (trimmed && trimmed.length <= MAX_LENGTH) unique.add(trimmed);
  }
  return [...unique].slice(0, MAX_FOLLOW_UPS);
}
