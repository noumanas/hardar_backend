import { Logger } from '@nestjs/common';

import { aContractSummary, contractTerms } from '../../../../test/support/builders.js';
import type { ContractsService } from '../../contracts/application/contracts.service.js';
import { analyzeContract } from '../../contracts/domain/contract-analyzer.js';
import { MessageKind } from '../../conversations/domain/message.entity.js';
import type { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import type { SpeechToText } from '../../speech/domain/speech.ports.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';
import { CONTRACT_PHOTO_MARKER, InboundContentResolver } from './inbound-content.resolver.js';

function setup() {
  const channel = {
    downloadMedia: vi.fn(),
    sendText: vi.fn(),
    sendAudio: vi.fn(),
    sendTemplate: vi.fn(),
  } satisfies MessagingChannel;
  const speech = { transcribe: vi.fn() } satisfies SpeechToText;
  const contracts = { read: vi.fn() };
  const resolver = new InboundContentResolver(channel, speech, contracts as unknown as ContractsService);
  return { channel, speech, contracts, resolver };
}

const base = { from: '9715', externalId: 'wamid.1' };
const audio = { data: Buffer.from('ogg'), mimeType: 'audio/ogg' };
const image = { data: Buffer.from('jpg'), mimeType: 'image/jpeg' };

describe('InboundContentResolver', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('passes text straight to the agent', async () => {
    const { resolver } = setup();

    await expect(resolver.resolve({ ...base, kind: 'text', text: 'سوال' }, 'w')).resolves.toEqual({
      type: 'prompt',
      kind: MessageKind.Text,
      body: 'سوال',
      prompt: 'سوال',
    });
  });

  describe('voice notes', () => {
    const voice = { ...base, kind: 'voice' as const, media: { id: 'a-1', mimeType: 'audio/ogg' } };

    it('transcribes the voice note and uses the transcript', async () => {
      const { channel, speech, resolver } = setup();
      channel.downloadMedia.mockResolvedValue(audio);
      speech.transcribe.mockResolvedValue('میری تنخواہ نہیں آئی');

      await expect(resolver.resolve(voice, 'w')).resolves.toMatchObject({
        type: 'prompt',
        kind: MessageKind.Voice,
        prompt: 'میری تنخواہ نہیں آئی',
      });
      expect(speech.transcribe).toHaveBeenCalledWith(audio);
    });

    it('falls back to the WhatsApp mime type when the download has none', async () => {
      const { channel, speech, resolver } = setup();
      channel.downloadMedia.mockResolvedValue({ data: audio.data, mimeType: '' });
      speech.transcribe.mockResolvedValue('ok');

      await resolver.resolve(voice, 'w');

      expect(speech.transcribe).toHaveBeenCalledWith({ data: audio.data, mimeType: 'audio/ogg' });
    });

    it.each([
      ['the voice note is not understood', () => Promise.resolve(null)],
      ['the transcript is blank', () => Promise.resolve('  ')],
      ['transcription fails', () => Promise.reject(new Error('STT down'))],
    ])('asks the worker to repeat or type when %s', async (_case, transcribe) => {
      const { channel, speech, resolver } = setup();
      channel.downloadMedia.mockResolvedValue(audio);
      speech.transcribe.mockImplementation(transcribe);

      await expect(resolver.resolve(voice, 'w')).resolves.toEqual({
        type: 'reply',
        kind: MessageKind.Voice,
        body: '[Voice note not understood]',
        reply: URDU_REPLIES.voiceNotUnderstood,
      });
    });
  });

  describe('contract photos', () => {
    const photo = { ...base, kind: 'image' as const, media: { id: 'i-1', mimeType: 'image/jpeg' } };

    it('reads the contract and gives the agent the terms, the problems and the card to append', async () => {
      const { channel, contracts, resolver } = setup();
      const terms = contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4 });
      channel.downloadMedia.mockResolvedValue(image);
      contracts.read.mockResolvedValue({
        legible: true,
        summary: aContractSummary({ terms, flags: analyzeContract(terms) }),
      });

      const resolved = await resolver.resolve({ ...photo, caption: 'is this ok?' }, 'worker-1');

      expect(contracts.read).toHaveBeenCalledWith('worker-1', image);
      expect(resolved).toMatchObject({
        type: 'prompt',
        kind: MessageKind.Image,
        body: `${CONTRACT_PHOTO_MARKER} is this ok?`,
      });
      if (resolved.type !== 'prompt') throw new Error('expected a prompt');
      expect(resolved.prompt).toContain('"workingHoursPerDay":10');
      expect(resolved.prompt).toContain('hours_per_day_above_limit');
      expect(resolved.prompt).toContain("The worker's caption: is this ok?");
      expect(resolved.attachment).toContain('معاہدے کا خلاصہ');
    });

    it('says there were no problems when the contract is fine', async () => {
      const { channel, contracts, resolver } = setup();
      channel.downloadMedia.mockResolvedValue(image);
      contracts.read.mockResolvedValue({ legible: true, summary: aContractSummary() });

      const resolved = await resolver.resolve(photo, 'worker-1');

      expect(resolved).toMatchObject({ body: CONTRACT_PHOTO_MARKER });
      expect(resolved.type === 'prompt' && resolved.prompt).toContain("Problems found by Haqdar's checker: none");
    });

    it('asks for a clearer photo when it cannot be read', async () => {
      const { channel, contracts, resolver } = setup();
      channel.downloadMedia.mockResolvedValue(image);
      contracts.read.mockResolvedValue({ legible: false });

      await expect(resolver.resolve(photo, 'worker-1')).resolves.toMatchObject({
        type: 'reply',
        reply: URDU_REPLIES.photoUnclear,
      });
    });
  });

  it('explains which message types are supported', async () => {
    const { resolver } = setup();

    await expect(resolver.resolve({ ...base, kind: 'unsupported', type: 'location' }, 'w')).resolves.toEqual({
      type: 'reply',
      kind: MessageKind.Text,
      body: '[Unsupported location message]',
      reply: URDU_REPLIES.unsupportedMessage,
    });
  });
});
