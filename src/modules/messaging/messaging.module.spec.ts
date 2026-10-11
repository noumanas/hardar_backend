import { Logger } from '@nestjs/common';

import { testConfig } from '../../../test/support/test-config.js';
import { ConsoleChannel } from './infrastructure/console.channel.js';
import { WhatsAppCloudChannel } from './infrastructure/whatsapp-cloud.channel.js';
import { createMessagingChannel } from './messaging.module.js';

describe('createMessagingChannel', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('uses the WhatsApp Cloud API when credentials are configured', () => {
    const channel = createMessagingChannel(
      testConfig({ WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: 'id' }),
    );
    expect(channel).toBeInstanceOf(WhatsAppCloudChannel);
  });

  it('falls back to logging messages in development', () => {
    expect(createMessagingChannel(testConfig())).toBeInstanceOf(ConsoleChannel);
  });

  it('refuses to start in production without WhatsApp credentials', () => {
    expect(() => createMessagingChannel(testConfig({ NODE_ENV: 'production' }))).toThrow('required in production');
  });
});

describe('ConsoleChannel', () => {
  const channel = new ConsoleChannel();

  it('logs outbound messages with the phone number masked', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await channel.sendText('971500001234', 'hello');
    await channel.sendAudio('971500001234', { data: Buffer.from('ogg'), mimeType: 'audio/ogg' });
    await channel.sendTemplate('971500001234', { name: 't', language: 'ur' });

    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.every((line) => line.includes('***1234') && !line.includes('9715000'))).toBe(true);
  });

  it('cannot download media', async () => {
    await expect(channel.downloadMedia('m-1')).rejects.toThrow('WhatsApp is not configured');
  });
});
