import { Injectable, Logger } from '@nestjs/common';

import { MessagingChannel, type Media, type TemplateMessage } from '../domain/messaging-channel.port.js';

/**
 * Development stand-in used when WhatsApp credentials are not set: outbound messages are
 * logged instead of sent. Media can't be downloaded without the real API.
 */
@Injectable()
export class ConsoleChannel extends MessagingChannel {
  private readonly logger = new Logger(ConsoleChannel.name);

  sendText(to: string, text: string): Promise<void> {
    this.logger.log(`→ ${mask(to)}: ${text}`);
    return Promise.resolve();
  }

  sendAudio(to: string, audio: Media): Promise<void> {
    this.logger.log(`→ ${mask(to)}: [${audio.mimeType} audio, ${audio.data.length} bytes]`);
    return Promise.resolve();
  }

  sendTemplate(to: string, template: TemplateMessage): Promise<void> {
    this.logger.log(`→ ${mask(to)}: [template ${template.name}/${template.language}]`);
    return Promise.resolve();
  }

  downloadMedia(mediaId: string): Promise<Media> {
    return Promise.reject(new Error(`Cannot download media ${mediaId}: WhatsApp is not configured`));
  }
}

/** Never log a full phone number. */
const mask = (phone: string): string => `***${phone.slice(-4)}`;
