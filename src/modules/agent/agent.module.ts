import { Module, type Provider, type Type } from '@nestjs/common';

import { CalculatorsModule } from '../calculators/calculators.module.js';
import { ComplaintsModule } from '../complaints/complaints.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { SpeechModule } from '../speech/speech.module.js';
import { WorkersModule } from '../workers/workers.module.js';
import { AgentOrchestrator } from './application/agent-orchestrator.service.js';
import { ConsentFlow } from './application/consent-flow.js';
import { InboundContentResolver } from './application/inbound-content.resolver.js';
import { CalculateGratuityTool } from './application/tools/calculate-gratuity.tool.js';
import { CalculateOvertimeTool } from './application/tools/calculate-overtime.tool.js';
import { GetComplaintGuideTool } from './application/tools/get-complaint-guide.tool.js';
import { GetSavedContractTool } from './application/tools/get-saved-contract.tool.js';
import { ScheduleFollowUpTool } from './application/tools/schedule-follow-up.tool.js';
import { SearchLabourLawTool } from './application/tools/search-labour-law.tool.js';
import { AgentRunner, DEMO_AGENT_RUNNER } from './domain/agent-runner.port.js';
import { AGENT_TOOLS, type AgentTool } from './domain/agent-tool.js';
import { DEMO_SYSTEM_PROMPT } from './domain/demo-system-prompt.js';
import { GeminiAgentRunner } from './infrastructure/gemini-agent-runner.js';
import { GEMINI_CLIENT } from '../llm/llm.constants.js';
import { LlmSettings } from '../llm/llm-settings.js';
import type { GoogleGenAI } from '@google/genai';
import { AgentPlaygroundController } from './presentation/agent-playground.controller.js';

/** To give the agent a new capability, add its tool class here; nothing else changes. */
const TOOLS: Type<AgentTool>[] = [
  SearchLabourLawTool,
  CalculateGratuityTool,
  CalculateOvertimeTool,
  GetSavedContractTool,
  GetComplaintGuideTool,
  ScheduleFollowUpTool,
];

const toolsProvider: Provider = {
  provide: AGENT_TOOLS,
  inject: TOOLS,
  useFactory: (...tools: AgentTool[]) => tools,
};

/** The website demo stores nothing, so it gets only the tools that need no saved worker. */
const DEMO_TOOLS: Type<AgentTool>[] = [
  SearchLabourLawTool,
  CalculateGratuityTool,
  CalculateOvertimeTool,
  GetComplaintGuideTool,
];

const demoRunnerProvider: Provider = {
  provide: DEMO_AGENT_RUNNER,
  inject: [GEMINI_CLIENT, LlmSettings, ...DEMO_TOOLS],
  useFactory: (client: GoogleGenAI | null, settings: LlmSettings, ...tools: AgentTool[]) =>
    new GeminiAgentRunner(client, settings, tools, DEMO_SYSTEM_PROMPT),
};

@Module({
  imports: [
    WorkersModule,
    ConversationsModule,
    ContractsModule,
    KnowledgeModule,
    CalculatorsModule,
    ComplaintsModule,
    SafetyModule,
    SpeechModule,
    MessagingModule,
  ],
  controllers: [AgentPlaygroundController],
  providers: [
    ...TOOLS,
    toolsProvider,
    ConsentFlow,
    InboundContentResolver,
    AgentOrchestrator,
    { provide: AgentRunner, useClass: GeminiAgentRunner },
    demoRunnerProvider,
  ],
  exports: [AgentOrchestrator, DEMO_AGENT_RUNNER],
})
export class AgentModule {}
