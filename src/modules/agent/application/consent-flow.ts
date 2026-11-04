import { Injectable } from '@nestjs/common';

import { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus, type Worker } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, repliesFor } from '../domain/replies.js';
import { parseConsentAnswer, parseLanguageChoice } from './commands.js';

export type ConsentDecision =
  | { proceed: true }
  /** `speak` is false for the language menu, which mixes four scripts and is sent as text only. */
  | { proceed: false; reply: string; speak: boolean };

/**
 * Onboarding before any message is processed. First the worker picks a language from the
 * menu; then (FR-4) they get the "not a lawyer" notice and the consent question in that
 * language. Nothing they send is processed or stored until they say yes.
 */
@Injectable()
export class ConsentFlow {
  constructor(private readonly workers: WorkersService) {}

  async decide(worker: Worker, message: InboundMessage): Promise<ConsentDecision> {
    if (!worker.language) return this.chooseLanguage(worker, message);
    if (worker.hasConsented) return { proceed: true };

    const replies = repliesFor(worker);
    const answer = message.kind === 'text' ? parseConsentAnswer(message.text) : null;
    if (answer !== null) {
      await this.workers.recordConsent(worker, answer);
      return { proceed: false, reply: answer ? replies.menu : replies.consentDeclined, speak: true };
    }

    return {
      proceed: false,
      reply: worker.consentStatus === ConsentStatus.Declined ? replies.consentDeclined : replies.greetingAndConsent,
      speak: true,
    };
  }

  private async chooseLanguage(worker: Worker, message: InboundMessage): Promise<ConsentDecision> {
    const choice = message.kind === 'text' ? parseLanguageChoice(message.text) : null;
    if (!choice) return { proceed: false, reply: LANGUAGE_MENU, speak: false };

    await this.workers.setLanguage(worker, choice);
    const replies = repliesFor({ language: choice });
    // A worker who agreed before and is only switching language goes straight to the menu.
    return { proceed: false, reply: worker.hasConsented ? replies.menu : replies.greetingAndConsent, speak: true };
  }
}
