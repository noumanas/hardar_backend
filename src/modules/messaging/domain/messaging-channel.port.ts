export interface Media {
  data: Buffer;
  mimeType: string;
}

export interface TemplateMessage {
  name: string;
  language: string;
  bodyParameters?: string[];
}

/**
 * The chat channel the worker uses (WhatsApp in the MVP). The agent and schedulers depend
 * on this port, so a new channel only needs a new adapter.
 */
export abstract class MessagingChannel {
  abstract sendText(to: string, text: string): Promise<void>;
  abstract sendAudio(to: string, audio: Media): Promise<void>;
  /** Pre-approved template, required to message a worker more than 24 hours after their last message. */
  abstract sendTemplate(to: string, template: TemplateMessage): Promise<void>;
  abstract downloadMedia(mediaId: string): Promise<Media>;
}
