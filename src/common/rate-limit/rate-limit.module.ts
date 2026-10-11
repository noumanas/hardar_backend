import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../config/app-config.service.js';
import { MemoryRateLimitStore } from './memory-rate-limit.store.js';
import { RateLimitStore } from './rate-limit.store.js';
import { RedisRateLimitStore } from './redis-rate-limit.store.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export function createRedisClient(config: AppConfigService): Redis | null {
  const url = config.get('REDIS_URL');
  if (!url) {
    if (config.isProduction) {
      new Logger('RateLimitModule').warn('REDIS_URL is not set: rate limits are counted per server, not shared');
    }
    return null;
  }
  // Fail fast instead of queueing while disconnected: the store then falls back to memory.
  return new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2_000 });
}

export function createRateLimitStore(redis: Redis | null): RateLimitStore {
  const memory = new MemoryRateLimitStore();
  return redis ? new RedisRateLimitStore(redis, memory) : memory;
}

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [AppConfigService], useFactory: createRedisClient },
    { provide: RateLimitStore, inject: [REDIS_CLIENT], useFactory: createRateLimitStore },
  ],
  exports: [RateLimitStore],
})
export class RateLimitModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }
}
