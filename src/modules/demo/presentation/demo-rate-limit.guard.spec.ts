import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { DemoRateLimiter, LimitDecision } from '../application/demo-rate-limiter.js';
import { DemoLimit, DemoRateLimitGuard } from './demo-rate-limit.guard.js';

class Routes {
  @DemoLimit('ai')
  limited(): void {}
  free(): void {}
}

function setup(decision: LimitDecision, handler: keyof Routes = 'limited', ip: string | null = '9.9.9.9') {
  const limiter = { consume: vi.fn().mockResolvedValue(decision) };
  const headers: Record<string, string> = {};
  const context = {
    getHandler: () => Routes.prototype[handler],
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: { remoteAddress: '10.0.0.1' } }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
  const guard = new DemoRateLimitGuard(new Reflector(), limiter as unknown as DemoRateLimiter);
  return { guard, context, limiter, headers };
}

describe('DemoRateLimitGuard', () => {
  it('lets unmarked routes through without counting', async () => {
    const { guard, context, limiter } = setup({ allowed: true, remaining: 1 }, 'free');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('counts the request against its kind and says how many remain', async () => {
    const { guard, context, limiter, headers } = setup({ allowed: true, remaining: 7 });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(limiter.consume).toHaveBeenCalledWith('ai', '9.9.9.9');
    expect(headers).toEqual({ 'X-Demo-Remaining': '7' });
  });

  it('falls back to the socket address when the request has no IP', async () => {
    const { guard, context, limiter } = setup({ allowed: true, remaining: 1 }, 'limited', null);
    await guard.canActivate(context);
    expect(limiter.consume).toHaveBeenCalledWith('ai', '10.0.0.1');
  });

  it.each([
    [
      { scope: 'visitor', window: 'minute', retryAfterSeconds: 42 },
      "You've reached the demo limit for this minute. Please try again in a minute.",
    ],
    [
      { scope: 'visitor', window: 'hour', retryAfterSeconds: 1_500 },
      "You've reached the demo limit for this hour. Please try again in 25 minutes.",
    ],
    [
      { scope: 'visitor', window: 'day', retryAfterSeconds: 7_300 },
      "You've reached the demo limit for this day. Please try again in 3 hours.",
    ],
    [
      { scope: 'everyone', window: 'hour', retryAfterSeconds: 600 },
      'The live demo is very busy right now. Please try again in 10 minutes.',
    ],
  ] as const)('refuses with 429, Retry-After and the scope (%j)', async (refusal, message) => {
    const { guard, context, headers } = setup({ allowed: false, ...refusal });

    const error = await guard.canActivate(context).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).message).toBe(message);
    expect(headers).toEqual({ 'Retry-After': String(refusal.retryAfterSeconds), 'X-Demo-Limit-Scope': refusal.scope });
  });
});
