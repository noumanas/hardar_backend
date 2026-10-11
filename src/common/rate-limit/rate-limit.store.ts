export interface WindowHit {
  /** Requests counted in the current window, including this one. */
  count: number;
  /** Milliseconds until the window resets. */
  resetInMs: number;
}

/**
 * Fixed-window request counters. Backed by Redis so limits hold across every server;
 * an in-memory store covers local development and tests.
 */
export abstract class RateLimitStore {
  /** Counts one request against `key` in a window of `windowMs`. */
  abstract hit(key: string, windowMs: number): Promise<WindowHit>;
}
