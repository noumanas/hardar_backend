import { Inject, Injectable } from '@nestjs/common';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { RateLimitStore } from '../../../common/rate-limit/rate-limit.store.js';
import {
  DEMO_LIMITS,
  EVERYONE_WINDOW_MS,
  type DemoAction,
  type DemoLimits,
  type LimitWindow,
} from '../domain/demo-limits.js';

export type LimitDecision =
  | { allowed: true; /** Requests left in the visitor's tightest window. */ remaining: number }
  | { allowed: false; scope: 'visitor' | 'everyone'; window: LimitWindow['name']; retryAfterSeconds: number };

/**
 * Decides whether a public demo request may go to the AI. The visitor's own windows are
 * checked first, so one heavy user can't spend everyone's budget; only then is the request
 * counted against the shared hourly ceiling. Visitors are keyed by a hash of their IP.
 */
@Injectable()
export class DemoRateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly crypto: CryptoService,
    @Inject(DEMO_LIMITS) private readonly limits: DemoLimits,
  ) {}

  async consume(action: DemoAction, clientIp: string): Promise<LimitDecision> {
    const visitor = this.crypto.hash(`demo-visitor:${clientIp}`).slice(0, 32);

    let remaining = Number.POSITIVE_INFINITY;
    let blocked: { window: LimitWindow['name']; retryAfterSeconds: number } | null = null;
    for (const window of this.limits.visitor[action]) {
      const hit = await this.store.hit(`demo:${action}:${window.name}:${visitor}`, window.ms);
      remaining = Math.min(remaining, Math.max(0, window.limit - hit.count));
      // When several windows are full, report the one that frees up last.
      if (hit.count > window.limit && seconds(hit.resetInMs) > (blocked?.retryAfterSeconds ?? 0)) {
        blocked = { window: window.name, retryAfterSeconds: seconds(hit.resetInMs) };
      }
    }
    if (blocked) return { allowed: false, scope: 'visitor', ...blocked };

    const everyone = await this.store.hit(`demo:${action}:everyone`, EVERYONE_WINDOW_MS);
    if (everyone.count > this.limits.everyoneHourly[action]) {
      return { allowed: false, scope: 'everyone', window: 'hour', retryAfterSeconds: seconds(everyone.resetInMs) };
    }
    return { allowed: true, remaining: Number.isFinite(remaining) ? remaining : 0 };
  }
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
