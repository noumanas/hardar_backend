import type { ConfigService } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import type { Env } from './env.schema.js';

const serviceFor = (env: Partial<Env>) =>
  new AppConfigService({ get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>);

describe('AppConfigService', () => {
  it('reads validated values', () => {
    expect(serviceFor({ PORT: 8080 }).get('PORT')).toBe(8080);
  });

  it('knows whether it runs in production', () => {
    expect(serviceFor({ NODE_ENV: 'production' }).isProduction).toBe(true);
    expect(serviceFor({ NODE_ENV: 'development' }).isProduction).toBe(false);
  });
});
