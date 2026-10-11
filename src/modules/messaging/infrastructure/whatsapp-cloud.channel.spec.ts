import { MAX_TEXT_LENGTH, splitText, WhatsAppApiError, WhatsAppCloudChannel } from './whatsapp-cloud.channel.js';

const config = { apiVersion: 'v23.0', accessToken: 'token-123', phoneNumberId: 'PHONE_ID' };
const GRAPH = 'https://graph.facebook.com/v23.0';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('WhatsAppCloudChannel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const channel = new WhatsAppCloudChannel(config);

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it('sends a text message with the bearer token', async () => {
    fetchMock.mockResolvedValue(json({ messages: [{ id: 'wamid.1' }] }));

    await channel.sendText('971500000001', 'سلام');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${GRAPH}/PHONE_ID/messages`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' });
    expect(sentBody()).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '971500000001',
      type: 'text',
      text: { preview_url: false, body: 'سلام' },
    });
  });

  it('splits text longer than WhatsApp allows into several messages', async () => {
    fetchMock.mockImplementation(async () => json({}));

    await channel.sendText('971500000001', 'a'.repeat(MAX_TEXT_LENGTH + 10));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uploads audio, then sends it by media id', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'media-9' })).mockResolvedValueOnce(json({}));

    await channel.sendAudio('971500000001', { data: Buffer.from('ogg'), mimeType: 'audio/ogg' });

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe(`${GRAPH}/PHONE_ID/media`);
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get('type')).toBe('audio/ogg');
    expect(sentBody(1)).toMatchObject({ type: 'audio', audio: { id: 'media-9' } });
  });

  it('sends a template with body parameters, or none', async () => {
    fetchMock.mockImplementation(async () => json({}));

    await channel.sendTemplate('971500000001', { name: 'follow_up', language: 'ur', bodyParameters: ['7'] });
    await channel.sendTemplate('971500000001', { name: 'follow_up', language: 'ur' });

    expect(sentBody(0).template).toEqual({
      name: 'follow_up',
      language: { code: 'ur' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: '7' }] }],
    });
    expect(sentBody(1).template.components).toEqual([]);
  });

  it('downloads media in two steps: metadata, then the file', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/jpeg', file_size: 3 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));

    const media = await channel.downloadMedia('media-1');

    expect(fetchMock.mock.calls[0][0]).toBe(`${GRAPH}/media-1`);
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://lookaside.fbsbx.com/x',
      { headers: { Authorization: 'Bearer token-123' } },
    ]);
    expect(media).toEqual({ data: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg' });
  });

  it('refuses media larger than 16 MB', async () => {
    fetchMock.mockResolvedValueOnce(json({ url: 'https://x', mime_type: 'audio/ogg', file_size: 17 * 1024 * 1024 }));

    await expect(channel.downloadMedia('big')).rejects.toMatchObject({ status: 413 });
  });

  it('raises WhatsAppApiError with the status on API failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"bad token"}', { status: 401 }));
    await expect(channel.sendText('971500000001', 'hi')).rejects.toThrow(WhatsAppApiError);

    fetchMock
      .mockResolvedValueOnce(json({ url: 'https://x', mime_type: 'image/jpeg' }))
      .mockResolvedValueOnce(new Response('gone', { status: 404 }));
    await expect(channel.downloadMedia('m')).rejects.toMatchObject({ status: 404 });
  });
});

describe('splitText', () => {
  it('returns short text unchanged', () => {
    expect(splitText('hello', 10)).toEqual(['hello']);
  });

  it('prefers to split on line breaks, never exceeding the limit', () => {
    const chunks = splitText('first paragraph\n\nsecond paragraph here', 25);

    expect(chunks).toEqual(['first paragraph', 'second paragraph here']);
    expect(chunks.every((chunk) => chunk.length <= 25)).toBe(true);
  });

  it('hard-splits text without line breaks', () => {
    expect(splitText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
