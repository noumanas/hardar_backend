import { Injectable } from '@nestjs/common';

import { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus, type Worker } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, repliesFor, welcomeFor } from '../domain/replies.js';
import { parseConsentAnswer, parseLanguageChoice } from './commands.js';

export type ConsentDecision =
  | { proceed: true }
  /** `speak` is false for the language menu, which mixes four scripts and is sent as text only. */
  | { proceed: false; reply: string; speak: boolean };

/**
 * Onboarding before any message is processed. The worker picks a language from the menu
 * and is then signed up automatically: there is no yes/no question. The welcome tells them
 * what Haqdar is, that their messages are saved and seen by the Haqdar team, and the menu
 * says how to delete everything. A worker who said "no" earlier stays out until they say yes.
 */
@Injectable()
export class ConsentFlow {
  constructor(private readonly workers: WorkersService) {}

  async decide(worker: Worker, message: InboundMessage): Promise<ConsentDecision> {
    if (!worker.language) return this.chooseLanguage(worker, message);
    if (worker.hasConsented) return { proceed: true };

    const answer = message.kind === 'text' ? parseConsentAnswer(message.text) : null;

    if (worker.consentStatus === ConsentStatus.Declined) {
      if (!answer) return { proceed: false, reply: repliesFor(worker).consentDeclined, speak: true };
      await this.workers.recordConsent(worker, true);
      return { proceed: false, reply: repliesFor(worker).menu, speak: true };
    }

    // Pending with a language: asked the old consent question before automatic sign-up.
    if (answer === false) {
      await this.workers.recordConsent(worker, false);
      return { proceed: false, reply: repliesFor(worker).consentDeclined, speak: true };
    }
    await this.workers.recordConsent(worker, true);
    // A plain "yes" gets the menu; anything else is a real question and is answered at once.
    return answer ? { proceed: false, reply: repliesFor(worker).menu, speak: true } : { proceed: true };
  }

  private async chooseLanguage(worker: Worker, message: InboundMessage): Promise<ConsentDecision> {
    const choice = message.kind === 'text' ? parseLanguageChoice(message.text) : null;
    if (!choice) return { proceed: false, reply: LANGUAGE_MENU, speak: false };

    await this.workers.setLanguage(worker, choice);
    const replies = repliesFor({ language: choice });

    // Only switching language: a signed-up worker goes straight to the menu, and a worker
    // who said no is reminded how to start.
    if (worker.hasConsented) return { proceed: false, reply: replies.menu, speak: true };
    if (worker.consentStatus === ConsentStatus.Declined) {
      return { proceed: false, reply: replies.consentDeclined, speak: true };
    }

    await this.workers.recordConsent(worker, true);
    return { proceed: false, reply: welcomeFor(choice), speak: true };
  }
}
