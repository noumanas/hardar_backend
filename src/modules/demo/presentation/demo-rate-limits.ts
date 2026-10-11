import { HttpStatus, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitInfo } from 'express-rate-limit';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import {
  DEMO_LIMITS,
  EVERYONE_WINDOW_MS,
  type DemoAction,
  type DemoLimits,
  type LimitWindow,
} from '../domain/demo-limits.js';

/** The public demo routes each kind of request covers. Chat and voice notes share one limit. */
const ROUTES: Record<DemoAction, string[]> = {
  ai: ['/demo/chat', '/demo/voice'],
  speech: ['/demo/speech'],
  contract: ['/demo/contract'],
};

type Scope = 'visitor' | 'everyone';

const waitText = (seconds: number) => {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? 'a minute' : minutes < 60 ? `${minutes} minutes` : `${Math.ceil(minutes / 60)} hours`;
};

/** A refusal in the API's usual error format, plus when to retry and whose limit it is. */
function refuse(scope: Scope, window: LimitWindow['name']) {
  return (
    request: Request,
    response: Response,
    _next: NextFunction,
    options: { requestPropertyName: string; windowMs: number },
  ) => {
    const info = (request as unknown as Record<string, RateLimitInfo | undefined>)[options.requestPropertyName];
    const resetAt = info?.resetTime?.getTime() ?? Date.now() + options.windowMs;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

    response.setHeader('Retry-After', String(retryAfter));
    response.setHeader('X-Demo-Limit-Scope', scope);
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: HttpStatus[HttpStatus.TOO_MANY_REQUESTS],
      message:
        scope === 'visitor'
          ? `You've reached the demo limit for this ${window}. Please try again in ${waitText(retryAfter)}.`
          : `The live demo is very busy right now. Please try again in ${waitText(retryAfter)}.`,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * Rate limits for one kind of demo request, as Express middleware: the visitor's own
 * windows first (keyed by a hash of their IP, never the raw address), then the shared hourly
 * ceiling. A visitor over their own limit is stopped before it counts against everyone.
 * Counts live in this server's memory, which is right for a single server.
 */
export function demoRateLimiters(
  action: DemoAction,
  limits: DemoLimits,
  visitorKey: (ip: string) => string,
): RequestHandler[] {
  const onlyPosts = (request: Request) => request.method !== 'POST';
  const property = (name: string) => `demoLimit_${action}_${name}`;

  const visitorWindows = limits.visitor[action].map((window) =>
    rateLimit({
      windowMs: window.ms,
      limit: window.limit,
      keyGenerator: (request) => visitorKey(ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? 'unknown')),
      requestPropertyName: property(window.name),
      standardHeaders: false,
      legacyHeaders: false,
      skip: onlyPosts,
      handler: refuse('visitor', window.name),
    }),
  );

  const everyone = rateLimit({
    windowMs: EVERYONE_WINDOW_MS,
    limit: limits.everyoneHourly[action],
    keyGenerator: () => `everyone:${action}`,
    requestPropertyName: property('everyone'),
    standardHeaders: false,
    legacyHeaders: false,
    skip: onlyPosts,
    handler: refuse('everyone', 'hour'),
  });

  /** How many requests the visitor has left in their tightest window, for the website. */
  const reportRemaining: RequestHandler = (request, response, next) => {
    const left = limits.visitor[action]
      .map(
        (window) => (request as unknown as Record<string, RateLimitInfo | undefined>)[property(window.name)]?.remaining,
      )
      .filter((value): value is number => value !== undefined);
    if (left.length > 0) response.setHeader('X-Demo-Remaining', String(Math.min(...left)));
    next();
  };

  return [...visitorWindows, everyone, reportRemaining];
}

/** Mounts the demo's limits on its AI routes, under the API prefix. */
export function applyDemoRateLimits(app: INestApplication, prefix: string): void {
  const limits = app.get<DemoLimits>(DEMO_LIMITS);
  const crypto = app.get(CryptoService);
  const visitorKey = (ip: string) => crypto.hash(`demo-visitor:${ip}`).slice(0, 32);

  for (const action of Object.keys(ROUTES) as DemoAction[]) {
    app.use(
      ROUTES[action].map((route) => `/${prefix}${route}`),
      ...demoRateLimiters(action, limits, visitorKey),
    );
  }
}
