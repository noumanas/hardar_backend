import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { TEST_ENV, testConfig } from '../../../test/support/test-config.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';

const contextWithKey = (key?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => (name === 'x-api-key' ? key : undefined) }),
    }),
  }) as ExecutionContext;

describe('AdminApiKeyGuard', () => {
  const config = testConfig();
  const guard = new AdminApiKeyGuard(config, new CryptoService(config));

  it('lets a request with the right key through', () => {
    expect(guard.canActivate(contextWithKey(TEST_ENV.ADMIN_API_KEY))).toBe(true);
  });

  it.each([undefined, '', 'wrong-key'])('rejects key %j', (key) => {
    expect(() => guard.canActivate(contextWithKey(key))).toThrow(UnauthorizedException);
  });
});
