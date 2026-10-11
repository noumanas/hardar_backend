import { testConfig } from '../../../../test/support/test-config.js';
import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { MemoryRateLimitStore } from '../../../common/rate-limit/memory-rate-limit.store.js';
import type { DemoLimits } from '../domain/demo-limits.js';
import { DemoRateLimiter } from './demo-rate-limiter.js';

const LIMITS: DemoLimits = {
  visitor: {
    ai: [
      { limit: 2, ms: 60_000, name: 'minute' },
      { limit: 3, ms: 3_600_000, name: 'hour' },
    ],
    speech: [{ limit: 5, ms: 60_000, name: 'minute' }],
    contract: [{ limit: 1, ms: 60_000, name: 'minute' }],
  },
  everyoneHourly: { ai: 4, speech: 100, contract: 100 },
};

function setup() {
  let now = 0;
  const store = new MemoryRateLimitStore(() => now);
  const hit = vi.spyOn(store, 'hit');
  const limiter = new DemoRateLimiter(store, new CryptoService(testConfig()), LIMITS);
  return { limiter, hit, advance: (ms: number) => (now += ms) };
}

describe('DemoRateLimiter', () => {
  it('reports what is left in the tightest window', async () => {
    const { limiter } = setup();
    await expect(limiter.consume('ai', '1.1.1.1')).resolves.toEqual({ allowed: true, remaining: 1 });
    await expect(limiter.consume('ai', '1.1.1.1')).resolves.toEqual({ allowed: true, remaining: 0 });
  });

  it('refuses a visitor over a window, with the time until it frees up', async () => {
    const { limiter } = setup();
    await limiter.consume('ai', '1.1.1.1');
    await limiter.consume('ai', '1.1.1.1');

    await expect(limiter.consume('ai', '1.1.1.1')).resolves.toEqual({
      allowed: false,
      scope: 'visitor',
      window: 'minute',
      retryAfterSeconds: 60,
    });
  });

  it('reports the window that frees up last when several are full', async () => {
    const { limiter, advance } = setup();
    await limiter.consume('ai', '1.1.1.1');
    await limiter.consume('ai', '1.1.1.1');
    advance(61_000);
    await limiter.consume('ai', '1.1.1.1'); // third this hour: fills the hour window too
    await limiter.consume('ai', '1.1.1.1');

    await expect(limiter.consume('ai', '1.1.1.1')).resolves.toMatchObject({ scope: 'visitor', window: 'hour' });
  });

  it('keeps visitors and kinds of request apart, and never stores the raw IP', async () => {
    const { limiter, hit } = setup();
    await limiter.consume('contract', '1.1.1.1');
    await expect(limiter.consume('contract', '1.1.1.1')).resolves.toMatchObject({ allowed: false });
    await expect(limiter.consume('contract', '2.2.2.2')).resolves.toMatchObject({ allowed: true });
    await expect(limiter.consume('ai', '1.1.1.1')).resolves.toMatchObject({ allowed: true });

    expect(hit.mock.calls.map(([key]) => key).join(' ')).not.toContain('1.1.1.1');
  });

  it('refuses everyone once the shared hourly budget is spent', async () => {
    const { limiter } = setup();
    for (const ip of ['1', '2', '3', '4'])
      await expect(limiter.consume('ai', ip)).resolves.toMatchObject({ allowed: true });

    await expect(limiter.consume('ai', '5')).resolves.toEqual({
      allowed: false,
      scope: 'everyone',
      window: 'hour',
      retryAfterSeconds: 3600,
    });
  });

  it('does not let a visitor who is over their own limit spend the shared budget', async () => {
    const { limiter, hit } = setup();
    for (let index = 0; index < 5; index += 1) await limiter.consume('ai', 'heavy');
    const everyoneHits = hit.mock.calls.filter(([key]) => key.endsWith(':everyone')).length;
    expect(everyoneHits).toBe(2);
  });
});
