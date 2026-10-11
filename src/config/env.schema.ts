import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * Every environment variable the app reads, validated once at boot.
 * A missing or malformed value stops the process with a readable error.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_SSL: z.stringbool().default(false),
  DATABASE_LOGGING: z.stringbool().default(false),

  /** Base64-encoded 32-byte key for AES-256-GCM encryption of personal data at rest. */
  ENCRYPTION_KEY: z.base64().refine((value) => Buffer.from(value, 'base64').length === 32, 'must decode to 32 bytes'),
  /** Secret for the HMAC used to look workers up by phone number without storing it in clear. */
  HASH_SECRET: z.string().min(32),
  ADMIN_API_KEY: z.string().min(24),

  /** Proxies/CDNs in front of the app, so the visitor's real IP is used for rate limits. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Ceilings on the public demo's AI use, all visitors together, per hour. */
  DEMO_AI_HOURLY_BUDGET: z.coerce.number().int().min(0).default(600),
  DEMO_SPEECH_HOURLY_BUDGET: z.coerce.number().int().min(0).default(600),
  DEMO_CONTRACT_HOURLY_BUDGET: z.coerce.number().int().min(0).default(200),

  AGENT_LLM_PROVIDER: z.enum(['gemini', 'none']).default('gemini'),
  GEMINI_API_KEY: optionalString,
  AGENT_MODEL: z.string().default('gemini-3.8-flash'),
  /** Gemini text-to-speech model and voice for spoken replies (website demo). */
  AGENT_TTS_MODEL: z.string().default('gemini-3.8-flash-tts'),
  AGENT_TTS_VOICE: z.string().default('Kore'),
  /** Gemini 3 thinking depth; `low` keeps voice replies inside the PRD's 15-second target. */
  AGENT_THINKING_LEVEL: z.enum(['low', 'medium', 'high']).default('low'),
  AGENT_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(12).default(6),
  CONVERSATION_HISTORY_LIMIT: z.coerce.number().int().min(0).max(50).default(12),

  WHATSAPP_API_VERSION: z.string().default('v23.0'),
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_FOLLOW_UP_TEMPLATE: optionalString,
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('ur'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production' && !env.WHATSAPP_APP_SECRET) {
    throw new Error('WHATSAPP_APP_SECRET is required in production to verify webhook signatures');
  }
  if (env.NODE_ENV === 'production' && env.AGENT_LLM_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required in production when AGENT_LLM_PROVIDER=gemini');
  }
  return env;
}
