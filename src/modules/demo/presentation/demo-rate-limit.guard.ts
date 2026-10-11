import {
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { DemoRateLimiter } from '../application/demo-rate-limiter.js';
import type { DemoAction } from '../domain/demo-limits.js';

const DEMO_ACTION = 'demo-rate-limit-action';

/** Marks a public demo route as costing one `action` (chat and voice share `ai`). */
export const DemoLimit = (action: DemoAction) => SetMetadata(DEMO_ACTION, action);

const minutes = (seconds: number) => {
  const value = Math.ceil(seconds / 60);
  return value <= 1 ? 'a minute' : value < 60 ? `${value} minutes` : `${Math.ceil(value / 60)} hours`;
};

/**
 * Applies the demo's rate limits before any work (and any AI cost) happens. Allowed
 * responses say how many requests remain; refused ones get 429 with `Retry-After` and
 * whether the limit is the visitor's own or the shared one.
 */
@Injectable()
export class DemoRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: DemoRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<DemoAction | undefined>(DEMO_ACTION, context.getHandler());
    if (!action) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const decision = await this.limiter.consume(action, request.ip ?? request.socket.remoteAddress ?? 'unknown');

    if (decision.allowed) {
      response.setHeader('X-Demo-Remaining', String(decision.remaining));
      return true;
    }

    response.setHeader('Retry-After', String(decision.retryAfterSeconds));
    response.setHeader('X-Demo-Limit-Scope', decision.scope);
    throw new HttpException(
      decision.scope === 'visitor'
        ? `You've reached the demo limit for this ${decision.window}. Please try again in ${minutes(decision.retryAfterSeconds)}.`
        : `The live demo is very busy right now. Please try again in ${minutes(decision.retryAfterSeconds)}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
