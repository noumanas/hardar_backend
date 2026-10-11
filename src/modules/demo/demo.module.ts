import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module.js';
import { CalculatorsModule } from '../calculators/calculators.module.js';
import { CalculatorsService } from '../calculators/application/calculators.service.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { KnowledgeService } from '../knowledge/application/knowledge.service.js';
import { SafetyModule } from '../safety/safety.module.js';
import { SpeechModule } from '../speech/speech.module.js';
import { DemoChatService } from './application/demo-chat.service.js';
import { DemoContractService } from './application/demo-contract.service.js';
import { DemoService } from './application/demo.service.js';
import { DEMO_SCENARIOS } from './domain/demo-scenarios.js';
import { ReplyTranslator } from './domain/reply-translator.port.js';
import { GeminiReplyTranslator } from './infrastructure/gemini-reply-translator.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DemoRateLimiter } from './application/demo-rate-limiter.js';
import { DEFAULT_VISITOR_LIMITS, DEMO_LIMITS, type DemoLimits } from './domain/demo-limits.js';
import { DemoController } from './presentation/demo.controller.js';
import { DemoRateLimitGuard } from './presentation/demo-rate-limit.guard.js';

@Module({
  imports: [CalculatorsModule, KnowledgeModule, ContractsModule, AgentModule, SafetyModule, SpeechModule],
  controllers: [DemoController],
  providers: [
    DemoContractService,
    DemoChatService,
    DemoRateLimiter,
    DemoRateLimitGuard,
    {
      provide: DEMO_LIMITS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): DemoLimits => ({
        visitor: DEFAULT_VISITOR_LIMITS,
        everyoneHourly: {
          ai: config.get('DEMO_AI_HOURLY_BUDGET'),
          speech: config.get('DEMO_SPEECH_HOURLY_BUDGET'),
          contract: config.get('DEMO_CONTRACT_HOURLY_BUDGET'),
        },
      }),
    },
    { provide: ReplyTranslator, useClass: GeminiReplyTranslator },
    {
      provide: DemoService,
      inject: [CalculatorsService, KnowledgeService],
      useFactory: (calculators: CalculatorsService, knowledge: KnowledgeService) =>
        new DemoService(calculators, knowledge, DEMO_SCENARIOS),
    },
  ],
})
export class DemoModule {}
