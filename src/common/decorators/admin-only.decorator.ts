import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AdminApiKeyGuard } from '../guards/admin-api-key.guard.js';

export const ADMIN_SECURITY_SCHEME = 'admin-api-key';

/** Marks a controller or route as admin-only, in both the guard chain and the API docs. */
export function AdminOnly(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    UseGuards(AdminApiKeyGuard),
    ApiSecurity(ADMIN_SECURITY_SCHEME),
    ApiUnauthorizedResponse({ description: 'Missing or invalid admin API key' }),
  );
}
