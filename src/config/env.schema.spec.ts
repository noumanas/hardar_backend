import { randomBytes } from 'node:crypto';

import { validateEnv } from './env.schema.js';

const required = {
  DATABASE_URL: 'postgres://user@localhost:5432/haqdar',
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HASH_SECRET: 'x'.repeat(32),
  ADMIN_API_KEY: 'k'.repeat(24),
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({
      ...required,
      PORT: '8080',
      DATABASE_SSL: 'true',
      CORS_ORIGINS: 'https://a.ae, https://b.ae,',
    });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_SSL: true,
      CORS_ORIGINS: ['https://a.ae', 'https://b.ae'],
      AGENT_LLM_PROVIDER: 'gemini',
      AGENT_MODEL: 'gemini-3.8-flash',
      AGENT_THINKING_LEVEL: 'low',
    });
    expect(env.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
  });

  it('treats blank optional values as unset', () => {
    expect(validateEnv({ ...required, GEMINI_API_KEY: '  ' }).GEMINI_API_KEY).toBeUndefined();
  });

  it.each([
    ['a non-Postgres database URL', { DATABASE_URL: 'mysql://localhost/db' }, 'DATABASE_URL'],
    ['a short encryption key', { ENCRYPTION_KEY: randomBytes(16).toString('base64') }, 'ENCRYPTION_KEY'],
    ['a short admin key', { ADMIN_API_KEY: 'short' }, 'ADMIN_API_KEY'],
    ['an unsupported thinking level', { AGENT_THINKING_LEVEL: 'minimal' }, 'AGENT_THINKING_LEVEL'],
  ])('rejects %s', (_case, override, field) => {
    expect(() => validateEnv({ ...required, ...override })).toThrow(field);
  });

  it('requires the WhatsApp app secret and the Gemini key in production', () => {
    const production = { ...required, NODE_ENV: 'production' };

    expect(() => validateEnv(production)).toThrow('WHATSAPP_APP_SECRET is required');
    expect(() => validateEnv({ ...production, WHATSAPP_APP_SECRET: 's' })).toThrow('GEMINI_API_KEY is required');
    expect(validateEnv({ ...production, WHATSAPP_APP_SECRET: 's', GEMINI_API_KEY: 'k' }).NODE_ENV).toBe('production');
    expect(validateEnv({ ...production, WHATSAPP_APP_SECRET: 's', AGENT_LLM_PROVIDER: 'none' }).NODE_ENV).toBe(
      'production',
    );
  });
});
