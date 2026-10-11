import { Injectable, Logger } from '@nestjs/common';

import { AgentOrchestrator } from '../../agent/application/agent-orchestrator.service.js';
import type { InboundMessage } from '../../agent/domain/inbound-message.js';
import { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';

/**
 * Processes webhook messages after the HTTP response has gone back to Meta, which retries
 * any webhook not acknowledged quickly. Messages from one sender run strictly in order;
 * different senders run concurrently.
 *
 * In-process by design for the pilot (100 concurrent users). For more scale or durability
 * across restarts, replace this class with a queue consumer; nothing else changes.
 */
@Injectable()
export class InboundMessageProcessor {
  private readonly logger = new Logger(InboundMessageProcessor.name);
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly orchestrator: AgentOrchestrator,
    private readonly channel: MessagingChannel,
  ) {}

  enqueue(messages: InboundMessage[]): void {
    for (const message of messages) {
      const previous = this.queues.get(message.from) ?? Promise.resolve();
      const next = previous.then(() => this.process(message));
      this.queues.set(message.from, next);
      void next.finally(() => {
        if (this.queues.get(message.from) === next) this.queues.delete(message.from);
      });
    }
  }

  /** Resolves once every queued message has been handled (graceful shutdown and tests). */
  async drain(): Promise<void> {
    while (this.queues.size > 0) await Promise.all(this.queues.values());
  }

  private async process(message: InboundMessage): Promise<void> {
    try {
      const reply = await this.orchestrator.handle(message);
      if (!reply) return;

      await this.channel.sendText(message.from, reply.text);
      if (reply.audio) await this.channel.sendAudio(message.from, reply.audio);
    } catch (error) {
      this.logger.error(
        `Failed to handle message ${message.externalId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
