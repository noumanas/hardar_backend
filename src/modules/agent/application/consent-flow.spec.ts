import { aWorker } from '../../../../test/support/builders.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import type { Language } from '../../workers/domain/language.js';
import { ConsentStatus } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, REPLIES, welcomeFor } from '../domain/replies.js';
import { ConsentFlow } from './consent-flow.js';

const textMessage = (text: string): InboundMessage => ({ kind: 'text', from: '9715', externalId: 'w', text });
const voiceMessage: InboundMessage = {
  kind: 'voice',
  from: '9715',
  externalId: 'w',
  media: { id: 'm', mimeType: 'audio/ogg' },
};

function setup() {
  const workers = {
    recordConsent: vi.fn(async (worker: { consentStatus: ConsentStatus }, granted: boolean) => {
      worker.consentStatus = granted ? ConsentStatus.Granted : ConsentStatus.Declined;
      return worker;
    }),
    setLanguage: vi.fn(async (worker: { language: string | null }, language: string | null) => {
      worker.language = language;
      return worker;
    }),
  };
  return { workers, flow: new ConsentFlow(workers as unknown as WorkersService) };
}

const pending = (language: Language | null = 'ur') => aWorker({ consentStatus: ConsentStatus.Pending, language });
const declined = (language: Language | null = 'ur') => aWorker({ consentStatus: ConsentStatus.Declined, language });

describe('ConsentFlow', () => {
  describe('a new worker', () => {
    it('gets the language menu, as text only, until they choose', async () => {
      const { workers, flow } = setup();

      await expect(flow.decide(pending(null), textMessage('salam'))).resolves.toEqual({
        proceed: false,
        reply: LANGUAGE_MENU,
        speak: false,
      });
      await expect(flow.decide(pending(null), voiceMessage)).resolves.toMatchObject({ reply: LANGUAGE_MENU });
      expect(workers.setLanguage).not.toHaveBeenCalled();
      expect(workers.recordConsent).not.toHaveBeenCalled();
    });

    it.each([
      ['1', 'ur'],
      ['2', 'hi'],
      ['3', 'bn'],
      ['4', 'en'],
    ] as const)('choosing %j is signed up automatically and welcomed in %s', async (text, language) => {
      const { workers, flow } = setup();
      const worker = pending(null);

      await expect(flow.decide(worker, textMessage(text))).resolves.toEqual({
        proceed: false,
        reply: welcomeFor(language),
        speak: true,
      });
      expect(workers.setLanguage).toHaveBeenCalledWith(worker, language);
      expect(workers.recordConsent).toHaveBeenCalledWith(worker, true);
    });

    it('is told what Haqdar is, that messages are saved, and how to delete them', () => {
      expect(welcomeFor('en')).toContain('I am not a lawyer');
      expect(welcomeFor('en')).toContain('Your messages are saved');
      expect(welcomeFor('en')).toContain('delete my data');
    });
  });

  it('lets a signed-up worker straight through', async () => {
    const { flow } = setup();
    await expect(flow.decide(aWorker(), textMessage('hi'))).resolves.toEqual({ proceed: true });
  });

  describe('switching language', () => {
    it('takes a signed-up worker straight to the menu', async () => {
      const { workers, flow } = setup();
      await expect(flow.decide(aWorker({ language: null }), textMessage('বাংলা'))).resolves.toMatchObject({
        reply: REPLIES.bn.menu,
      });
      expect(workers.recordConsent).not.toHaveBeenCalled();
    });

    it('does not sign up a worker who said no', async () => {
      const { workers, flow } = setup();
      await expect(flow.decide(declined(null), textMessage('4'))).resolves.toMatchObject({
        reply: REPLIES.en.consentDeclined,
      });
      expect(workers.recordConsent).not.toHaveBeenCalled();
    });
  });

  describe('a worker who said no', () => {
    it('is reminded how to start, until they say yes', async () => {
      const { workers, flow } = setup();
      const worker = declined();

      await expect(flow.decide(worker, textMessage('help'))).resolves.toMatchObject({
        reply: REPLIES.ur.consentDeclined,
      });
      expect(workers.recordConsent).not.toHaveBeenCalled();

      await expect(flow.decide(worker, textMessage('yes'))).resolves.toMatchObject({ reply: REPLIES.ur.menu });
      expect(workers.recordConsent).toHaveBeenCalledWith(worker, true);
    });
  });

  describe('a worker asked the old consent question', () => {
    it('is signed up and has their question answered straight away', async () => {
      const { workers, flow } = setup();
      const worker = pending('hi');

      await expect(flow.decide(worker, textMessage('मेरा वेतन नहीं आया'))).resolves.toEqual({ proceed: true });
      expect(workers.recordConsent).toHaveBeenCalledWith(worker, true);
    });

    it('gets the menu after answering yes', async () => {
      const { flow } = setup();
      await expect(flow.decide(pending('hi'), textMessage('हाँ'))).resolves.toMatchObject({ reply: REPLIES.hi.menu });
    });

    it('can still say no', async () => {
      const { workers, flow } = setup();
      const worker = pending();

      await expect(flow.decide(worker, textMessage('nahi'))).resolves.toMatchObject({
        reply: REPLIES.ur.consentDeclined,
      });
      expect(workers.recordConsent).toHaveBeenCalledWith(worker, false);
    });
  });
});
