import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Logger } from '@nestjs/common';

import { testConfig } from '../../../test/support/test-config.js';
import type { Env } from '../../config/env.schema.js';
import { toJsonSchema } from './json-schema.js';
import { LlmSettings } from './llm-settings.js';
import { createGeminiClient } from './llm.module.js';
import { z } from 'zod';

const clientFor = (env: Partial<Env>) => {
  const config = testConfig(env);
  return createGeminiClient(new LlmSettings(config), config);
};

describe('LlmSettings', () => {
  it.each([
    ['low', ThinkingLevel.LOW],
    ['medium', ThinkingLevel.MEDIUM],
    ['high', ThinkingLevel.HIGH],
  ] as const)('maps thinking level %s to %s', (level, expected) => {
    expect(new LlmSettings(testConfig({ AGENT_THINKING_LEVEL: level })).thinkingLevel).toBe(expected);
  });

  it('is enabled only with the Gemini provider and an API key', () => {
    expect(new LlmSettings(testConfig()).enabled).toBe(true);
    expect(new LlmSettings(testConfig({ GEMINI_API_KEY: undefined })).enabled).toBe(false);
    expect(new LlmSettings(testConfig({ AGENT_LLM_PROVIDER: 'none' })).enabled).toBe(false);
  });
});

describe('createGeminiClient', () => {
  it('creates a client when Gemini is configured', () => {
    expect(clientFor({})).toBeInstanceOf(GoogleGenAI);
  });

  it('creates none, with a warning, when it is not', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(clientFor({ GEMINI_API_KEY: undefined })).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('toJsonSchema', () => {
  it('drops the $schema dialect marker Gemini does not need', () => {
    expect(toJsonSchema(z.strictObject({ n: z.number() }))).toEqual({
      type: 'object',
      properties: { n: { type: 'number' } },
      required: ['n'],
      additionalProperties: false,
    });
  });
});
