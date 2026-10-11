import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AppConfigService } from '../../config/app-config.service.js';
import { CryptoService } from '../crypto/crypto.service.js';

export const ADMIN_API_KEY_HEADER = 'x-api-key';

/** Protects admin endpoints with a shared API key sent in the `x-api-key` header. */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(ADMIN_API_KEY_HEADER);

    if (!provided || !this.crypto.safeEqual(provided, this.config.get('ADMIN_API_KEY'))) {
      throw new UnauthorizedException('A valid admin API key is required');
    }
    return true;
  }
}
