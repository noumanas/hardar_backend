import { parseWhatsAppWebhook } from './whatsapp-payload.parser.js';

const webhook = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1' }, messages, ...extra },
        },
      ],
    },
  ],
});

describe('parseWhatsAppWebhook', () => {
  it('maps text, voice and image messages', () => {
    const messages = parseWhatsAppWebhook(
      webhook([
        { from: '9715001', id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'سلام' } },
        {
          from: '9715001',
          id: 'wamid.2',
          type: 'audio',
          audio: { id: 'a-1', mime_type: 'audio/ogg; codecs=opus', voice: true },
        },
        {
          from: '9715001',
          id: 'wamid.3',
          type: 'image',
          image: { id: 'i-1', mime_type: 'image/jpeg', caption: 'my contract' },
        },
      ]),
    );

    expect(messages).toEqual([
      { from: '9715001', externalId: 'wamid.1', kind: 'text', text: 'سلام' },
      {
        from: '9715001',
        externalId: 'wamid.2',
        kind: 'voice',
        media: { id: 'a-1', mimeType: 'audio/ogg; codecs=opus' },
      },
      {
        from: '9715001',
        externalId: 'wamid.3',
        kind: 'image',
        media: { id: 'i-1', mimeType: 'image/jpeg' },
        caption: 'my contract',
      },
    ]);
  });

  it('reads a PDF document as a contract, but not other documents', () => {
    const messages = parseWhatsAppWebhook(
      webhook([
        {
          from: '1',
          id: 'pdf',
          type: 'document',
          document: { id: 'm1', mime_type: 'application/pdf', filename: 'contract.pdf', caption: 'my contract' },
        },
        { from: '1', id: 'doc', type: 'document', document: { id: 'm2', mime_type: 'application/msword' } },
      ]),
    );

    expect(messages).toEqual([
      {
        from: '1',
        externalId: 'pdf',
        kind: 'image',
        media: { id: 'm1', mimeType: 'application/pdf' },
        caption: 'my contract',
      },
      { from: '1', externalId: 'doc', kind: 'unsupported', type: 'document' },
    ]);
  });

  it('marks other message types as unsupported so the worker gets an explanation', () => {
    expect(parseWhatsAppWebhook(webhook([{ from: '1', id: 'w', type: 'location', location: {} }]))).toEqual([
      { from: '1', externalId: 'w', kind: 'unsupported', type: 'location' },
    ]);
  });

  it('treats a text message without a body as unsupported', () => {
    expect(parseWhatsAppWebhook(webhook([{ from: '1', id: 'w', type: 'text' }]))[0]).toMatchObject({
      kind: 'unsupported',
    });
  });

  it('ignores reactions and delivery receipts', () => {
    expect(parseWhatsAppWebhook(webhook([{ from: '1', id: 'w', type: 'reaction', reaction: {} }]))).toEqual([]);
    expect(
      parseWhatsAppWebhook(webhook([], { messages: undefined, statuses: [{ id: 'wamid.1', status: 'read' }] })),
    ).toEqual([]);
  });

  it.each([null, 'text', { entry: 'nope' }, {}])('returns nothing for a malformed payload (%j)', (payload) => {
    expect(parseWhatsAppWebhook(payload)).toEqual([]);
  });
});
