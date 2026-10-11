import { Injectable } from '@nestjs/common';

import { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus, type Worker } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';
import { parseConsentAnswer } from './commands.js';

export type ConsentDecision = { proceed: true } | { proceed: false; reply: string };

/**
 * FR-4: nothing a worker sends is processed or stored until they agree. First contact
 * gets the "not a lawyer" notice and a consent question; "yes" or "no" is recorded.
 */
@Injectable()
export class ConsentFlow {
  constructor(private readonly workers: WorkersService) {}

  async decide(worker: Worker, isNew: boolean, message: InboundMessage): Promise<ConsentDecision> {
    if (worker.hasConsented) return { proceed: true };
    if (isNew) return { proceed: false, reply: URDU_REPLIES.greetingAndConsent };

    const answer = message.kind === 'text' ? parseConsentAnswer(message.text) : null;
    if (answer !== null) {
      await this.workers.recordConsent(worker, answer);
      return { proceed: false, reply: answer ? URDU_REPLIES.menu : URDU_REPLIES.consentDeclined };
    }

    return {
      proceed: false,
      reply:
        worker.consentStatus === ConsentStatus.Declined
          ? URDU_REPLIES.consentDeclined
          : URDU_REPLIES.greetingAndConsent,
    };
  }
}
