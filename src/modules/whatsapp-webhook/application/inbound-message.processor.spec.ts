import { Logger } from '@nestjs/common';

import type { AgentOrchestrator } from '../../agent/application/agent-orchestrator.service.js';
import type { InboundMessage } from '../../agent/domain/inbound-message.js';
import type { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import { InboundMessageProcessor } from './inbound-message.processor.js';

const text = (from: string, id: string): InboundMessage => ({ kind: 'text', from, externalId: id, text: id });

function setup() {
  const orchestrator = { handle: vi.fn() };
  const channel = {
    sendText: vi.fn(),
    sendAudio: vi.fn(),
    sendTemplate: vi.fn(),
    downloadMedia: vi.fn(),
  } satisfies MessagingChannel;
  const processor = new InboundMessageProcessor(orchestrator as unknown as AgentOrchestrator, channel);
  return { orchestrator, channel, processor };
}

describe('InboundMessageProcessor', () => {
  it('sends the text reply, then the voice version when there is one', async () => {
    const { orchestrator, channel, processor } = setup();
    const audio = { data: Buffer.from('ogg'), mimeType: 'audio/ogg' };
    orchestrator.handle.mockResolvedValue({ text: 'جواب', audio });

    processor.enqueue([text('971501', 'wamid.1')]);
    await processor.drain();

    expect(channel.sendText).toHaveBeenCalledWith('971501', 'جواب');
    expect(channel.sendAudio).toHaveBeenCalledWith('971501', audio);
  });

  it('sends nothing for a duplicate delivery', async () => {
    const { orchestrator, channel, processor } = setup();
    orchestrator.handle.mockResolvedValue(null);

    processor.enqueue([text('971501', 'wamid.1')]);
    await processor.drain();

    expect(channel.sendText).not.toHaveBeenCalled();
  });

  it("handles one sender's messages strictly in order", async () => {
    const { orchestrator, processor } = setup();
    const order: string[] = [];
    orchestrator.handle.mockImplementation(async (message: InboundMessage) => {
      await new Promise((resolve) => setTimeout(resolve, message.externalId === 'first' ? 20 : 0));
      order.push(message.externalId);
      return null;
    });

    processor.enqueue([text('971501', 'first')]);
    processor.enqueue([text('971501', 'second')]);
    await processor.drain();

    expect(order).toEqual(['first', 'second']);
  });

  it('keeps going after a failure and logs it', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { orchestrator, channel, processor } = setup();
    orchestrator.handle.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ text: 'ok' });

    processor.enqueue([text('971501', 'bad'), text('971501', 'good')]);
    await processor.drain();

    expect(error).toHaveBeenCalledOnce();
    expect(channel.sendText).toHaveBeenCalledWith('971501', 'ok');
  });

  it('drains immediately when nothing is queued', async () => {
    await expect(setup().processor.drain()).resolves.toBeUndefined();
  });
});
