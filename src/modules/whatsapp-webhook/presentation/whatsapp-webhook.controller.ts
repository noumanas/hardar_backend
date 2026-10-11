import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { AppConfigService } from '../../../config/app-config.service.js';
import { InboundMessageProcessor } from '../application/inbound-message.processor.js';
import { parseWhatsAppWebhook } from '../application/whatsapp-payload.parser.js';
import { SIGNATURE_HEADER, WhatsAppSignatureGuard } from './whatsapp-signature.guard.js';

/** FR-1: receives WhatsApp text, voice notes and images through the Cloud API webhook. */
@ApiTags('WhatsApp webhook')
@SkipThrottle()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly processor: InboundMessageProcessor,
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Meta's webhook verification handshake" })
  @ApiQuery({ name: 'hub.mode', example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token' })
  @ApiQuery({ name: 'hub.challenge' })
  @ApiOkResponse({ description: 'Echoes hub.challenge', type: String })
  @ApiForbiddenResponse({ description: 'Wrong verify token' })
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN');
    if (mode !== 'subscribe' || !expected || !token || !this.crypto.safeEqual(token, expected)) {
      throw new ForbiddenException('Webhook verification failed');
    }
    return challenge;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(WhatsAppSignatureGuard)
  @ApiOperation({ summary: 'Incoming WhatsApp messages; acknowledged at once, processed in the background' })
  @ApiHeader({ name: SIGNATURE_HEADER, description: 'sha256=<HMAC of the raw body with the app secret>' })
  @ApiBody({ description: 'WhatsApp Cloud API webhook payload', schema: { type: 'object' } })
  @ApiOkResponse({ schema: { properties: { received: { type: 'number', example: 1 } } } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid signature' })
  receive(@Body() payload: unknown): { received: number } {
    const messages = parseWhatsAppWebhook(payload);
    this.processor.enqueue(messages);
    return { received: messages.length };
  }
}
