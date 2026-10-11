import { RateLimitStore, type WindowHit } from './rate-limit.store.js';

/** Sweep expired windows every this many hits, so the map can't grow without bound. */
const SWEEP_EVERY = 1_000;

/** Counters in this process only: each server counts separately. For development and tests. */
export class MemoryRateLimitStore extends RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private hits = 0;

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  hit(key: string, windowMs: number): Promise<WindowHit> {
    const now = this.now();
    if (++this.hits % SWEEP_EVERY === 0) this.sweep(now);

    const current = this.windows.get(key);
    const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    window.count += 1;
    this.windows.set(key, window);
    return Promise.resolve({ count: window.count, resetInMs: window.resetAt - now });
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
