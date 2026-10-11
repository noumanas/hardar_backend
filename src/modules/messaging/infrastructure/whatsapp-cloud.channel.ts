import { MessagingChannel, type Media, type TemplateMessage } from '../domain/messaging-channel.port.js';

export interface WhatsAppCloudConfig {
  apiVersion: string;
  accessToken: string;
  phoneNumberId: string;
}

export class WhatsAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`WhatsApp Cloud API responded ${status}: ${responseBody.slice(0, 300)}`);
    this.name = WhatsAppApiError.name;
  }
}

/** WhatsApp caps a text message body at 4096 characters. */
export const MAX_TEXT_LENGTH = 4096;
/** WhatsApp media is at most 16 MB for audio and 5 MB for images; reject anything larger. */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

/** Adapter for the WhatsApp Business Cloud API (Meta Graph API). Built by MessagingModule's factory. */
export class WhatsAppCloudChannel extends MessagingChannel {
  private readonly baseUrl: string;

  constructor(private readonly config: WhatsAppCloudConfig) {
    super();
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion}`;
  }

  async sendText(to: string, text: string): Promise<void> {
    for (const chunk of splitText(text, MAX_TEXT_LENGTH)) {
      await this.send(to, { type: 'text', text: { preview_url: false, body: chunk } });
    }
  }

  async sendAudio(to: string, audio: Media): Promise<void> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', audio.mimeType);
    form.append('file', new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }), 'reply');

    const { id } = await this.request<{ id: string }>(`/${this.config.phoneNumberId}/media`, {
      method: 'POST',
      body: form,
    });
    await this.send(to, { type: 'audio', audio: { id } });
  }

  async sendTemplate(to: string, template: TemplateMessage): Promise<void> {
    const parameters = template.bodyParameters ?? [];
    await this.send(to, {
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: parameters.length
          ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }]
          : [],
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<Media> {
    const meta = await this.request<{ url: string; mime_type: string; file_size?: number }>(
      `/${encodeURIComponent(mediaId)}`,
      { method: 'GET' },
    );
    if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) {
      throw new WhatsAppApiError(413, `media ${mediaId} is ${meta.file_size} bytes`);
    }

    const response = await fetch(meta.url, { headers: this.authHeader() });
    if (!response.ok) throw new WhatsAppApiError(response.status, await response.text());
    return { data: Buffer.from(await response.arrayBuffer()), mimeType: meta.mime_type };
  }

  private send(to: string, message: Record<string, unknown>): Promise<unknown> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.authHeader(), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) throw new WhatsAppApiError(response.status, await response.text());
    return (await response.json()) as T;
  }

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }
}

/** Splits on paragraph, then line, then hard boundaries so no chunk exceeds `max`. */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
    const end = cut > max / 2 ? cut : max;
    chunks.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
