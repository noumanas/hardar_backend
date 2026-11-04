import { Logger } from '@nestjs/common';

import type { AgentOrchestrator } from '../../agent/application/agent-orchestrator.service.js';
import type { InboundMessage } from '../../agent/domain/inbound-message.js';
import type { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import type { TextToSpeech } from '../../speech/domain/speech.ports.js';
import { InboundMessageProcessor } from './inbound-message.processor.js';

const audio = { data: Buffer.from('OggS'), mimeType: 'audio/ogg' };

const text = (from: string, id: string): InboundMessage => ({ kind: 'text', from, externalId: id, text: id });

function setup() {
  const orchestrator = { handle: vi.fn() };
  const channel = {
    sendText: vi.fn(),
    sendAudio: vi.fn(),
    sendTemplate: vi.fn(),
    downloadMedia: vi.fn(),
  } satisfies MessagingChannel;
  const voice = { synthesize: vi.fn().mockResolvedValue(audio) } satisfies TextToSpeech;
  const processor = new InboundMessageProcessor(orchestrator as unknown as AgentOrchestrator, channel, voice);
  return { orchestrator, channel, voice, processor };
}

describe('InboundMessageProcessor', () => {
  it('sends the text reply first, then a voice note of the spoken part', async () => {
    const { orchestrator, channel, voice, processor } = setup();
    const order: string[] = [];
    channel.sendText.mockImplementation(async () => void order.push('text'));
    channel.sendAudio.mockImplementation(async () => void order.push('voice'));
    orchestrator.handle.mockResolvedValue({ text: 'جواب\n\nکارڈ', voiceText: 'جواب' });

    processor.enqueue([text('971501', 'wamid.1')]);
    await processor.drain();

    expect(channel.sendText).toHaveBeenCalledWith('971501', 'جواب\n\nکارڈ');
    expect(voice.synthesize).toHaveBeenCalledWith('جواب');
    expect(channel.sendAudio).toHaveBeenCalledWith('971501', audio);
    expect(order).toEqual(['text', 'voice']);
  });

  it('sends text only when the reply is not to be spoken', async () => {
    const { orchestrator, channel, voice, processor } = setup();
    orchestrator.handle.mockResolvedValue({ text: 'menu', voiceText: null });

    processor.enqueue([text('971501', 'wamid.1')]);
    await processor.drain();

    expect(channel.sendText).toHaveBeenCalledWith('971501', 'menu');
    expect(voice.synthesize).not.toHaveBeenCalled();
    expect(channel.sendAudio).not.toHaveBeenCalled();
  });

  it.each([
    [
      'speech fails',
      (voice: { synthesize: ReturnType<typeof vi.fn> }) => voice.synthesize.mockRejectedValue(new Error('TTS down')),
    ],
    [
      'there is no speech',
      (voice: { synthesize: ReturnType<typeof vi.fn> }) => voice.synthesize.mockResolvedValue(null),
    ],
  ])('still delivers the text when %s', async (_case, arrange) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { orchestrator, channel, voice, processor } = setup();
    arrange(voice);
    orchestrator.handle.mockResolvedValue({ text: 'جواب', voiceText: 'جواب' });

    processor.enqueue([text('971501', 'wamid.1')]);
    await processor.drain();

    expect(channel.sendText).toHaveBeenCalledWith('971501', 'جواب');
    expect(channel.sendAudio).not.toHaveBeenCalled();
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
    orchestrator.handle.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ text: 'ok', voiceText: null });

    processor.enqueue([text('971501', 'bad'), text('971501', 'good')]);
    await processor.drain();

    expect(error).toHaveBeenCalledOnce();
    expect(channel.sendText).toHaveBeenCalledWith('971501', 'ok');
  });

  it('drains immediately when nothing is queued', async () => {
    await expect(setup().processor.drain()).resolves.toBeUndefined();
  });
});
