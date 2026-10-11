import { createHmac } from 'node:crypto';

import { type ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';

import { testConfig } from '../../../../test/support/test-config.js';
import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { WhatsAppSignatureGuard } from './whatsapp-signature.guard.js';

const body = Buffer.from('{"entry":[]}');
const sign = (payload: Buffer, secret = 'test-app-secret') =>
  `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

const contextFor = (signature?: string, rawBody: Buffer | null = body): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ rawBody: rawBody ?? undefined, header: () => signature }) }),
  }) as unknown as ExecutionContext;

describe('WhatsAppSignatureGuard', () => {
  const config = testConfig();
  const guard = new WhatsAppSignatureGuard(config, new CryptoService(config));

  it('accepts a body signed with the app secret', () => {
    expect(guard.canActivate(contextFor(sign(body)))).toBe(true);
  });

  it.each([
    ['no signature', undefined, body],
    ['no raw body', sign(body), null],
    ['a signature made with another secret', sign(body, 'attacker'), body],
    ['a signature over different bytes', sign(Buffer.from('{}')), body],
  ])('rejects %s', (_case, signature, rawBody) => {
    expect(() => guard.canActivate(contextFor(signature, rawBody))).toThrow(UnauthorizedException);
  });

  it('lets requests through with a warning when no secret is configured (development)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const devConfig = testConfig({ WHATSAPP_APP_SECRET: undefined });
    const devGuard = new WhatsAppSignatureGuard(devConfig, new CryptoService(devConfig));

    expect(devGuard.canActivate(contextFor(undefined))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
