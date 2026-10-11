import { Module, type OnApplicationShutdown } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { InboundMessageProcessor } from './application/inbound-message.processor.js';
import { WhatsAppSignatureGuard } from './presentation/whatsapp-signature.guard.js';
import { WhatsAppWebhookController } from './presentation/whatsapp-webhook.controller.js';

@Module({
  imports: [AgentModule, MessagingModule],
  controllers: [WhatsAppWebhookController],
  providers: [InboundMessageProcessor, WhatsAppSignatureGuard],
  exports: [InboundMessageProcessor],
})
export class WhatsAppWebhookModule implements OnApplicationShutdown {
  constructor(private readonly processor: InboundMessageProcessor) {}

  /** Finish replying to messages already accepted before the process exits. */
  onApplicationShutdown(): Promise<void> {
    return this.processor.drain();
  }
}
