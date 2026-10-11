import { aWorker } from '../../../../test/support/builders.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus } from '../../workers/domain/worker.entity.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';
import { ConsentFlow } from './consent-flow.js';

const textMessage = (text: string): InboundMessage => ({ kind: 'text', from: '9715', externalId: 'w', text });
const voiceMessage: InboundMessage = {
  kind: 'voice',
  from: '9715',
  externalId: 'w',
  media: { id: 'm', mimeType: 'audio/ogg' },
};

function setup() {
  const workers = { recordConsent: vi.fn() };
  return { workers, flow: new ConsentFlow(workers as unknown as WorkersService) };
}

describe('ConsentFlow', () => {
  const pending = () => aWorker({ consentStatus: ConsentStatus.Pending });

  it('lets a worker who has agreed straight through', async () => {
    const { flow } = setup();
    await expect(flow.decide(aWorker(), false, textMessage('hi'))).resolves.toEqual({ proceed: true });
  });

  it('greets a first-time sender with the not-a-lawyer notice and asks for consent', async () => {
    const { workers, flow } = setup();

    await expect(flow.decide(pending(), true, textMessage('ہاں'))).resolves.toEqual({
      proceed: false,
      reply: URDU_REPLIES.greetingAndConsent,
    });
    expect(workers.recordConsent).not.toHaveBeenCalled();
  });

  it('records "yes" and shows the menu', async () => {
    const { workers, flow } = setup();
    const worker = pending();

    await expect(flow.decide(worker, false, textMessage('ہاں'))).resolves.toEqual({
      proceed: false,
      reply: URDU_REPLIES.menu,
    });
    expect(workers.recordConsent).toHaveBeenCalledWith(worker, true);
  });

  it('records "no" and explains that nothing will be stored', async () => {
    const { workers, flow } = setup();
    const worker = pending();

    await expect(flow.decide(worker, false, textMessage('nahi'))).resolves.toEqual({
      proceed: false,
      reply: URDU_REPLIES.consentDeclined,
    });
    expect(workers.recordConsent).toHaveBeenCalledWith(worker, false);
  });

  it('asks again when the answer is neither yes nor no, or not text', async () => {
    const { flow } = setup();

    await expect(flow.decide(pending(), false, textMessage('kya hai yeh?'))).resolves.toMatchObject({
      reply: URDU_REPLIES.greetingAndConsent,
    });
    await expect(flow.decide(pending(), false, voiceMessage)).resolves.toMatchObject({
      reply: URDU_REPLIES.greetingAndConsent,
    });
  });

  it('reminds a worker who declined how to start, until they say yes', async () => {
    const { workers, flow } = setup();
    const declined = aWorker({ consentStatus: ConsentStatus.Declined });

    await expect(flow.decide(declined, false, textMessage('help'))).resolves.toMatchObject({
      reply: URDU_REPLIES.consentDeclined,
    });
    await expect(flow.decide(declined, false, textMessage('yes'))).resolves.toMatchObject({ reply: URDU_REPLIES.menu });
    expect(workers.recordConsent).toHaveBeenCalledWith(declined, true);
  });
});
