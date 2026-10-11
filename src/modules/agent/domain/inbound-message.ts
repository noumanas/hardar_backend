import type { Media } from '../../messaging/domain/messaging-channel.port.js';

export interface MediaReference {
  id: string;
  mimeType: string;
}

interface InboundBase {
  /** Sender's phone number in international format, digits only. */
  from: string;
  /** Channel message id, used to drop duplicate deliveries. */
  externalId: string;
}

/** A worker message, independent of the channel it arrived on. */
export type InboundMessage =
  | (InboundBase & { kind: 'text'; text: string })
  | (InboundBase & { kind: 'voice'; media: MediaReference })
  /** A contract to read: a photo, or a PDF document. */
  | (InboundBase & { kind: 'image'; media: MediaReference; caption?: string })
  | (InboundBase & { kind: 'unsupported'; type: string });

export interface OutboundReply {
  text: string;
  /** Voice version of the reply, sent when the worker wrote by voice and TTS is available. */
  audio?: Media;
}
