/** What a public demo request costs: each kind is limited on its own. */
export type DemoAction = 'ai' | 'speech' | 'contract';

export interface LimitWindow {
  limit: number;
  ms: number;
  /** How the window is named to the visitor ("this minute", "this hour"…). */
  name: 'minute' | 'hour' | 'day';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DemoLimits {
  /** Per visitor (by IP). Every window must have room for a request to go through. */
  visitor: Record<DemoAction, LimitWindow[]>;
  /** All visitors together, per hour: the ceiling on what the demo can cost. */
  everyoneHourly: Record<DemoAction, number>;
}

/** Chat and voice notes share `ai`; each answer's voice note is `speech`. */
export const DEFAULT_VISITOR_LIMITS: DemoLimits['visitor'] = {
  ai: [
    { limit: 10, ms: MINUTE, name: 'minute' },
    { limit: 40, ms: HOUR, name: 'hour' },
    { limit: 150, ms: DAY, name: 'day' },
  ],
  speech: [
    { limit: 20, ms: MINUTE, name: 'minute' },
    { limit: 150, ms: HOUR, name: 'hour' },
  ],
  contract: [
    { limit: 5, ms: MINUTE, name: 'minute' },
    { limit: 20, ms: DAY, name: 'day' },
  ],
};

export const EVERYONE_WINDOW_MS = HOUR;

/** Injection token, so tests can tighten or loosen the limits. */
export const DEMO_LIMITS = Symbol('DEMO_LIMITS');
