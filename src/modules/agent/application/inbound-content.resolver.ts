import { Injectable, Logger } from '@nestjs/common';

import { formatContractCard } from '../../contracts/application/contract-card.js';
import { ContractsService } from '../../contracts/application/contracts.service.js';
import { MessageKind } from '../../conversations/domain/message.entity.js';
import { MessagingChannel } from '../../messaging/domain/messaging-channel.port.js';
import { SpeechToText } from '../../speech/domain/speech.ports.js';
import type { InboundMessage } from '../domain/inbound-message.js';
import { URDU_REPLIES } from '../domain/urdu-replies.js';

/** What the agent should work with, or a fixed reply when there is nothing to work with. */
export type ResolvedContent =
  | {
      type: 'prompt';
      kind: MessageKind;
      /** What is stored in the conversation (never the media itself). */
      body: string;
      /** What the agent is asked to respond to. */
      prompt: string;
      /** Appended to the agent's reply, e.g. the contract summary card. */
      attachment?: string;
    }
  | { type: 'reply'; kind: MessageKind; body: string; reply: string };

export const CONTRACT_PHOTO_MARKER = '[Contract photo]';

/** Turns any inbound message into text: transcribes voice notes and reads contract photos. */
@Injectable()
export class InboundContentResolver {
  private readonly logger = new Logger(InboundContentResolver.name);

  constructor(
    private readonly channel: MessagingChannel,
    private readonly speech: SpeechToText,
    private readonly contracts: ContractsService,
  ) {}

  async resolve(message: InboundMessage, workerId: string): Promise<ResolvedContent> {
    switch (message.kind) {
      case 'text':
        return { type: 'prompt', kind: MessageKind.Text, body: message.text, prompt: message.text };
      case 'voice':
        return this.resolveVoice(message.media.id, message.media.mimeType);
      case 'image':
        return this.resolveContractPhoto(message.media.id, workerId, message.caption);
      case 'unsupported':
        return {
          type: 'reply',
          kind: MessageKind.Text,
          body: `[Unsupported ${message.type} message]`,
          reply: URDU_REPLIES.unsupportedMessage,
        };
    }
  }

  private async resolveVoice(mediaId: string, mimeType: string): Promise<ResolvedContent> {
    const transcript = await this.channel
      .downloadMedia(mediaId)
      .then((audio) => this.speech.transcribe({ data: audio.data, mimeType: audio.mimeType || mimeType }))
      .catch((error: unknown) => {
        this.logger.warn(`Voice note ${mediaId} could not be transcribed: ${String(error)}`);
        return null;
      });

    if (!transcript?.trim()) {
      return {
        type: 'reply',
        kind: MessageKind.Voice,
        body: '[Voice note not understood]',
        reply: URDU_REPLIES.voiceNotUnderstood,
      };
    }
    return { type: 'prompt', kind: MessageKind.Voice, body: transcript, prompt: transcript };
  }

  private async resolveContractPhoto(mediaId: string, workerId: string, caption?: string): Promise<ResolvedContent> {
    const body = caption ? `${CONTRACT_PHOTO_MARKER} ${caption}` : CONTRACT_PHOTO_MARKER;
    const image = await this.channel.downloadMedia(mediaId);
    const reading = await this.contracts.read(workerId, image);

    if (!reading.legible) {
      return { type: 'reply', kind: MessageKind.Image, body, reply: URDU_REPLIES.photoUnclear };
    }

    const { terms, flags } = reading.summary;
    const prompt = [
      CONTRACT_PHOTO_MARKER,
      `Extracted terms (null means not found): ${JSON.stringify(terms)}`,
      `Problems found by Haqdar's checker: ${flags.length ? JSON.stringify(flags) : 'none'}`,
      caption ? `The worker's caption: ${caption}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return { type: 'prompt', kind: MessageKind.Image, body, prompt, attachment: formatContractCard(terms, flags) };
  }
}
