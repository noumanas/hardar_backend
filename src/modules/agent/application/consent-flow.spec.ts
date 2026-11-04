import { aWorker } from '../../../../test/support/builders.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { LANGUAGE_MENU, REPLIES } from '../domain/replies.js';
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
    recordConsent: vi.fn(),
    setLanguage: vi.fn(async (worker: { language: string | null }, language: string | null) => {
      worker.language = language;
      return worker;
    }),
  };
  return { workers, flow: new ConsentFlow(workers as unknown as WorkersService) };
}

describe('ConsentFlow', () => {
  const pending = (language: 'ur' | 'hi' | 'bn' | 'en' | null = 'ur') =>
    aWorker({ consentStatus: ConsentStatus.Pending, language });

  describe('choosing a language', () => {
    it('shows the language menu, as text only, to a worker who has not chosen one', async () => {
      const { workers, flow } = setup();

      await expect(flow.decide(pending(null), textMessage('salam'))).resolves.toEqual({
        proceed: false,
        reply: LANGUAGE_MENU,
        speak: false,
      });
      await expect(flow.decide(pending(null), voiceMessage)).resolves.toMatchObject({ reply: LANGUAGE_MENU });
      expect(workers.setLanguage).not.toHaveBeenCalled();
    });

    it.each([
      ['1', 'ur'],
      ['2', 'hi'],
      ['3', 'bn'],
      ['4', 'en'],
    ] as const)('saves choice %j as %s and asks for consent in that language', async (text, language) => {
      const { workers, flow } = setup();
      const worker = pending(null);

      await expect(flow.decide(worker, textMessage(text))).resolves.toEqual({
        proceed: false,
        reply: REPLIES[language].greetingAndConsent,
        speak: true,
      });
      expect(workers.setLanguage).toHaveBeenCalledWith(worker, language);
    });

    it('takes a worker who already agreed straight to the menu after switching language', async () => {
      const { flow } = setup();
      const worker = aWorker({ language: null });

      await expect(flow.decide(worker, textMessage('বাংলা'))).resolves.toMatchObject({ reply: REPLIES.bn.menu });
    });
  });

  it('lets a worker who has agreed straight through', async () => {
    const { flow } = setup();
    await expect(flow.decide(aWorker(), textMessage('hi'))).resolves.toEqual({ proceed: true });
  });

  it('records "yes" in the worker\'s language and shows the menu', async () => {
    const { workers, flow } = setup();
    const worker = pending('hi');

    await expect(flow.decide(worker, textMessage('हाँ'))).resolves.toEqual({
      proceed: false,
      reply: REPLIES.hi.menu,
      speak: true,
    });
    expect(workers.recordConsent).toHaveBeenCalledWith(worker, true);
  });

  it('records "no" and explains that nothing will be stored', async () => {
    const { workers, flow } = setup();
    const worker = pending();

    await expect(flow.decide(worker, textMessage('nahi'))).resolves.toEqual({
      proceed: false,
      reply: REPLIES.ur.consentDeclined,
      speak: true,
    });
    expect(workers.recordConsent).toHaveBeenCalledWith(worker, false);
  });

  it('asks again when the answer is neither yes nor no, or not text', async () => {
    const { flow } = setup();

    await expect(flow.decide(pending('en'), textMessage('what is this?'))).resolves.toMatchObject({
      reply: REPLIES.en.greetingAndConsent,
    });
    await expect(flow.decide(pending(), voiceMessage)).resolves.toMatchObject({
      reply: REPLIES.ur.greetingAndConsent,
    });
  });

  it('reminds a worker who declined how to start, until they say yes', async () => {
    const { workers, flow } = setup();
    const declined = aWorker({ consentStatus: ConsentStatus.Declined });

    await expect(flow.decide(declined, textMessage('help'))).resolves.toMatchObject({
      reply: REPLIES.ur.consentDeclined,
    });
    await expect(flow.decide(declined, textMessage('yes'))).resolves.toMatchObject({ reply: REPLIES.ur.menu });
    expect(workers.recordConsent).toHaveBeenCalledWith(declined, true);
  });
});
