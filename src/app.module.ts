import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CryptoModule } from './common/crypto/crypto.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AgentModule } from './modules/agent/agent.module.js';
import { CalculatorsModule } from './modules/calculators/calculators.module.js';
import { ComplaintsModule } from './modules/complaints/complaints.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { KnowledgeModule } from './modules/knowledge/knowledge.module.js';
import { LlmModule } from './modules/llm/llm.module.js';
import { WhatsAppWebhookModule } from './modules/whatsapp-webhook/whatsapp-webhook.module.js';

@Module({
  imports: [
    // Platform
    AppConfigModule,
    CryptoModule,
    RateLimitModule,
    DatabaseModule,
    LlmModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,

    // Features
    WhatsAppWebhookModule,
    AgentModule,
    CalculatorsModule,
    ComplaintsModule,
    KnowledgeModule,
    AdminModule,
    DemoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
