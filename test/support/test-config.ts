import { randomBytes } from 'node:crypto';

import type { AppConfigService } from '../../src/config/app-config.service.js';
import type { Env } from '../../src/config/env.schema.js';

export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3000,
  CORS_ORIGINS: [],
  DATABASE_URL: 'postgres://localhost:5432/haqdar_test',
  DATABASE_SSL: false,
  DATABASE_LOGGING: false,
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HASH_SECRET: 'test-hash-secret-that-is-at-least-32-chars',
  ADMIN_API_KEY: 'test-admin-api-key-0123456789',
  AGENT_LLM_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'test-gemini-key',
  AGENT_MODEL: 'gemini-3.8-flash',
  REDIS_URL: undefined,
  TRUST_PROXY_HOPS: 0,
  DEMO_AI_HOURLY_BUDGET: 600,
  DEMO_SPEECH_HOURLY_BUDGET: 600,
  DEMO_CONTRACT_HOURLY_BUDGET: 200,
  AGENT_TTS_MODEL: 'gemini-3.8-flash-tts',
  AGENT_TTS_VOICE: 'Kore',
  AGENT_THINKING_LEVEL: 'low',
  AGENT_MAX_TOOL_ROUNDS: 3,
  CONVERSATION_HISTORY_LIMIT: 12,
  WHATSAPP_API_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: undefined,
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  WHATSAPP_APP_SECRET: 'test-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
  WHATSAPP_FOLLOW_UP_TEMPLATE: undefined,
  WHATSAPP_TEMPLATE_LANGUAGE: 'ur',
};

/** An `AppConfigService` stand-in for unit tests, backed by `TEST_ENV` plus overrides. */
export function testConfig(overrides: Partial<Env> = {}): AppConfigService {
  const env = { ...TEST_ENV, ...overrides };
  return {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
    get isProduction() {
      return env.NODE_ENV === 'production';
    },
  } as AppConfigService;
}
