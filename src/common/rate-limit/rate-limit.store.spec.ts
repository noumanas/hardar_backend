import { Logger } from '@nestjs/common';

import { testConfig } from '../../../test/support/test-config.js';
import { MemoryRateLimitStore } from './memory-rate-limit.store.js';
import { createRateLimitStore, createRedisClient } from './rate-limit.module.js';
import { RedisRateLimitStore } from './redis-rate-limit.store.js';

describe('MemoryRateLimitStore', () => {
  it('counts hits in a window and starts again once it ends', async () => {
    let now = 1_000;
    const store = new MemoryRateLimitStore(() => now);

    await expect(store.hit('a', 60_000)).resolves.toEqual({ count: 1, resetInMs: 60_000 });
    now += 10_000;
    await expect(store.hit('a', 60_000)).resolves.toEqual({ count: 2, resetInMs: 50_000 });
    await expect(store.hit('b', 60_000)).resolves.toMatchObject({ count: 1 });

    now += 50_000;
    await expect(store.hit('a', 60_000)).resolves.toEqual({ count: 1, resetInMs: 60_000 });
  });

  it('forgets expired windows as it goes', async () => {
    let now = 0;
    const store = new MemoryRateLimitStore(() => now);
    for (let index = 0; index < 999; index += 1) await store.hit(`key-${index}`, 10);
    now = 100;
    await store.hit('trigger', 10); // the 1,000th hit sweeps
    const windows = (store as unknown as { windows: Map<string, unknown> }).windows;
    expect([...windows.keys()]).toEqual(['trigger']);
  });
});

describe('RedisRateLimitStore', () => {
  it('counts and sets the expiry in one atomic script', async () => {
    const redis = { eval: vi.fn().mockResolvedValue([3, 41_000]) };
    const store = new RedisRateLimitStore(redis, new MemoryRateLimitStore());

    await expect(store.hit('demo:ai:minute:abc', 60_000)).resolves.toEqual({ count: 3, resetInMs: 41_000 });

    const [script, keys, key, windowMs] = redis.eval.mock.calls[0];
    expect(script).toContain('INCR');
    expect(script).toContain('PEXPIRE');
    expect([keys, key, windowMs]).toEqual([1, 'haqdar:rate:demo:ai:minute:abc', 60_000]);
  });

  it('counts in memory when Redis is down, and warns once a minute rather than every request', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const redis = { eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const fallback = new MemoryRateLimitStore();
    const store = new RedisRateLimitStore(redis, fallback);

    await expect(store.hit('k', 60_000)).resolves.toMatchObject({ count: 1 });
    await expect(store.hit('k', 60_000)).resolves.toMatchObject({ count: 2 });
    redis.eval.mockRejectedValue('timeout');
    await store.hit('k', 60_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('ECONNREFUSED');
  });
});

describe('rate-limit store selection', () => {
  it('uses memory when no Redis URL is set, and warns about it in production', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(createRedisClient(testConfig())).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(createRedisClient(testConfig({ NODE_ENV: 'production' }))).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL is not set'));

    expect(createRateLimitStore(null)).toBeInstanceOf(MemoryRateLimitStore);
  });

  it('uses Redis when a URL is set', async () => {
    const redis = createRedisClient(testConfig({ REDIS_URL: 'redis://127.0.0.1:1' }))!;
    try {
      expect(createRateLimitStore(redis)).toBeInstanceOf(RedisRateLimitStore);
    } finally {
      redis.disconnect();
    }
  });
});
