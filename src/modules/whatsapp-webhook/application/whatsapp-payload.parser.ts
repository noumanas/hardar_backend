import { z } from 'zod';

import type { InboundMessage } from '../../agent/domain/inbound-message.js';

const mediaSchema = z.object({ id: z.string(), mime_type: z.string().default('application/octet-stream') });

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: mediaSchema.optional(),
  image: mediaSchema.extend({ caption: z.string().optional() }).optional(),
  document: mediaSchema.extend({ caption: z.string().optional(), filename: z.string().optional() }).optional(),
});

const webhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        changes: z.array(z.object({ value: z.object({ messages: z.array(messageSchema).optional() }) })),
      }),
    )
    .default([]),
});

/** Message types that carry no request from the worker and get no reply. */
const IGNORED_TYPES = new Set(['reaction', 'system', 'ephemeral', 'unsupported']);

type WhatsAppMessage = z.infer<typeof messageSchema>;

/**
 * Turns a WhatsApp Cloud API webhook into channel-agnostic inbound messages.
 * Delivery receipts (`statuses`) and unknown fields are ignored.
 */
export function parseWhatsAppWebhook(payload: unknown): InboundMessage[] {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.entry
    .flatMap((entry) => entry.changes)
    .flatMap((change) => change.value.messages ?? [])
    .filter((message) => !IGNORED_TYPES.has(message.type))
    .map(toInboundMessage);
}

function toInboundMessage(message: WhatsAppMessage): InboundMessage {
  const base = { from: message.from, externalId: message.id };

  if (message.type === 'text' && message.text) return { ...base, kind: 'text', text: message.text.body };
  if (message.type === 'audio' && message.audio) {
    return { ...base, kind: 'voice', media: { id: message.audio.id, mimeType: message.audio.mime_type } };
  }
  if (message.type === 'image' && message.image) {
    return {
      ...base,
      kind: 'image',
      media: { id: message.image.id, mimeType: message.image.mime_type },
      caption: message.image.caption,
    };
  }
  // A contract sent as a PDF file is read exactly like a photo of one. Other documents are not.
  if (message.type === 'document' && message.document?.mime_type.toLowerCase().startsWith('application/pdf')) {
    return {
      ...base,
      kind: 'image',
      media: { id: message.document.id, mimeType: 'application/pdf' },
      caption: message.document.caption,
    };
  }
  return { ...base, kind: 'unsupported', type: message.type };
}
