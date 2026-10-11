import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RateLimitStore, type WindowHit } from './rate-limit.store.js';

/** Count and expiry set in one atomic step, so concurrent servers never lose a hit. */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }`;

const KEY_PREFIX = 'haqdar:rate:';
const WARN_EVERY_MS = 60_000;

/**
 * Shared counters in Redis. If Redis is unreachable the request is counted in memory
 * instead: limits then hold per server, which is weaker but never blocks visitors.
 */
export class RedisRateLimitStore extends RateLimitStore {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private lastWarning = 0;

  constructor(
    private readonly redis: Pick<Redis, 'eval'>,
    private readonly fallback: RateLimitStore,
  ) {
    super();
  }

  async hit(key: string, windowMs: number): Promise<WindowHit> {
    try {
      const [count, ttl] = (await this.redis.eval(HIT_SCRIPT, 1, `${KEY_PREFIX}${key}`, windowMs)) as [number, number];
      return { count, resetInMs: ttl };
    } catch (error) {
      if (Date.now() - this.lastWarning > WARN_EVERY_MS) {
        this.lastWarning = Date.now();
        this.logger.warn(
          `Redis unavailable, counting rate limits per server: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return this.fallback.hit(key, windowMs);
    }
  }
}
