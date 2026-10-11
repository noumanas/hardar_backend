import { ThinkingLevel } from '@google/genai';
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';

const THINKING_LEVELS = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
} as const;

/** Model choices shared by every Gemini call in the app. */
@Injectable()
export class LlmSettings {
  readonly enabled: boolean;
  readonly model: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly maxToolRounds: number;
  readonly ttsModel: string;
  readonly ttsVoice: string;

  constructor(config: AppConfigService) {
    this.enabled = config.get('AGENT_LLM_PROVIDER') === 'gemini' && Boolean(config.get('GEMINI_API_KEY'));
    this.model = config.get('AGENT_MODEL');
    this.thinkingLevel = THINKING_LEVELS[config.get('AGENT_THINKING_LEVEL')];
    this.maxToolRounds = config.get('AGENT_MAX_TOOL_ROUNDS');
    this.ttsModel = config.get('AGENT_TTS_MODEL');
    this.ttsVoice = config.get('AGENT_TTS_VOICE');
  }
}
