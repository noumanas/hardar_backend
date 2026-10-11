import { createHmac } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { AppConfigService } from '../../../config/app-config.service.js';

export const SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Accepts a webhook only if Meta signed its exact raw body with the app secret
 * (`X-Hub-Signature-256: sha256=<hmac>`). The secret is mandatory in production;
 * without it (local development) requests are let through with a warning.
 */
@Injectable()
export class WhatsAppSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsAppSignatureGuard.name);
  private readonly appSecret: string | undefined;

  constructor(
    config: AppConfigService,
    private readonly crypto: CryptoService,
  ) {
    this.appSecret = config.get('WHATSAPP_APP_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.appSecret) {
      this.logger.warn('WHATSAPP_APP_SECRET is not set; webhook signature NOT verified');
      return true;
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const signature = request.header(SIGNATURE_HEADER);
    if (!signature || !request.rawBody) throw new UnauthorizedException('Missing webhook signature');

    const expected = `sha256=${createHmac('sha256', this.appSecret).update(request.rawBody).digest('hex')}`;
    if (!this.crypto.safeEqual(signature, expected)) throw new UnauthorizedException('Invalid webhook signature');
    return true;
  }
}
