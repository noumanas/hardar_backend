import { Logger, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { MessagingChannel } from './domain/messaging-channel.port.js';
import { ConsoleChannel } from './infrastructure/console.channel.js';
import { WhatsAppCloudChannel } from './infrastructure/whatsapp-cloud.channel.js';

export function createMessagingChannel(config: AppConfigService): MessagingChannel {
  const accessToken = config.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = config.get('WHATSAPP_PHONE_NUMBER_ID');

  if (accessToken && phoneNumberId) {
    return new WhatsAppCloudChannel({ apiVersion: config.get('WHATSAPP_API_VERSION'), accessToken, phoneNumberId });
  }
  if (config.isProduction) {
    throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required in production');
  }
  new Logger('MessagingModule').warn('WhatsApp is not configured; outbound messages will be logged only');
  return new ConsoleChannel();
}

@Module({
  providers: [{ provide: MessagingChannel, inject: [AppConfigService], useFactory: createMessagingChannel }],
  exports: [MessagingChannel],
})
export class MessagingModule {}
