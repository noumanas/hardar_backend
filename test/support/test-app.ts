import { createHmac } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AgentRunner } from '../../src/modules/agent/domain/agent-runner.port.js';
import { ContractExtractor } from '../../src/modules/contracts/domain/contract-extractor.port.js';
import { GEMINI_CLIENT } from '../../src/modules/llm/llm.constants.js';
import {
  MessagingChannel,
  type Media,
  type TemplateMessage,
} from '../../src/modules/messaging/domain/messaging-channel.port.js';
import { SIGNATURE_HEADER } from '../../src/modules/whatsapp-webhook/presentation/whatsapp-signature.guard.js';
import { InboundMessageProcessor } from '../../src/modules/whatsapp-webhook/application/inbound-message.processor.js';
import { SpeechToText, type TextToSpeech } from '../../src/modules/speech/domain/speech.ports.js';
import { GeminiTextToSpeech } from '../../src/modules/speech/infrastructure/gemini-text-to-speech.js';
import { ReplyTranslator } from '../../src/modules/demo/domain/reply-translator.port.js';
import { DEMO_LIMITS, type DemoLimits } from '../../src/modules/demo/domain/demo-limits.js';
import { TEST_ENV } from './test-config.js';

/** Records everything the app sends to workers, and serves fake media. */
export class FakeChannel extends MessagingChannel {
  readonly texts: { to: string; text: string }[] = [];
  readonly templates: { to: string; template: TemplateMessage }[] = [];
  media: Media = { data: Buffer.from('fake-media'), mimeType: 'image/jpeg' };

  sendText(to: string, text: string): Promise<void> {
    this.texts.push({ to, text });
    return Promise.resolve();
  }
  sendAudio(): Promise<void> {
    return Promise.resolve();
  }
  sendTemplate(to: string, template: TemplateMessage): Promise<void> {
    this.templates.push({ to, template });
    return Promise.resolve();
  }
  downloadMedia(): Promise<Media> {
    return Promise.resolve(this.media);
  }
  lastTextTo(to: string): string | undefined {
    return this.texts.filter((sent) => sent.to === to).at(-1)?.text;
  }
}

export interface TestAppOptions {
  /** Replace the agent runner (the default keeps the real Gemini runner). */
  runner?: AgentRunner;
  /** Scripted stand-in for the Gemini SDK client used by the real runner. */
  geminiClient?: unknown;
  extractor?: ContractExtractor;
  /** Voice transcription; by default nothing is understood, so no test calls Google. */
  speech?: SpeechToText;
  /** Spoken replies for the website demo; by default a tiny fixed WAV, so no test calls Google. */
  voice?: TextToSpeech;
  /** English translations on the demo; by default a fixed sentence, so no test calls Google. */
  translator?: ReplyTranslator;
  /** Demo rate limits; by default high enough that only tests about limits ever hit them. */
  demoLimits?: DemoLimits;
}

const MINUTE = 60_000;
/** Limits no ordinary e2e file reaches, so request counts don't leak between tests. */
export const GENEROUS_DEMO_LIMITS: DemoLimits = {
  visitor: {
    ai: [{ limit: 1_000, ms: MINUTE, name: 'minute' }],
    speech: [{ limit: 1_000, ms: MINUTE, name: 'minute' }],
    contract: [{ limit: 1_000, ms: MINUTE, name: 'minute' }],
  },
  everyoneHourly: { ai: 1_000, speech: 1_000, contract: 1_000 },
};

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  channel: FakeChannel;
  dataSource: DataSource;
  /** Waits for background webhook processing to finish. */
  drain(): Promise<void>;
  close(): Promise<void>;
}

/** Boots the real AppModule (real config, pipes, guards, filters, Swagger) on the test database. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const channel = new FakeChannel();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MessagingChannel)
    .useValue(channel)
    .overrideProvider(ContractExtractor)
    .useValue(options.extractor ?? { extract: () => Promise.reject(new Error('no extractor in this test')) })
    .overrideProvider(SpeechToText)
    .useValue(options.speech ?? { transcribe: () => Promise.resolve(null) })
    .overrideProvider(GeminiTextToSpeech)
    .useValue(options.voice ?? { synthesize: () => Promise.resolve({ data: TEST_WAV, mimeType: 'audio/wav' }) })
    .overrideProvider(ReplyTranslator)
    .useValue(options.translator ?? { toEnglish: () => Promise.resolve('(English translation)') })
    .overrideProvider(DEMO_LIMITS)
    .useValue(options.demoLimits ?? GENEROUS_DEMO_LIMITS);

  if (options.runner) builder = builder.overrideProvider(AgentRunner).useValue(options.runner);
  if (options.geminiClient) builder = builder.overrideProvider(GEMINI_CLIENT).useValue(options.geminiClient);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await resetDatabase(dataSource);
  const processor = app.get(InboundMessageProcessor);

  return {
    app,
    http: request(app.getHttpServer()),
    channel,
    dataSource,
    drain: () => processor.drain(),
    close: () => app.close(),
  };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE workers, conversations, messages, contract_summaries, complaint_cases, law_articles RESTART IDENTITY CASCADE',
  );
}

/** A 44-byte header plus a few silent samples: a valid, playable WAV. */
export const TEST_WAV = (() => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + 8, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(8, 40);
  return Buffer.concat([header, Buffer.alloc(8)]);
})();

export const ADMIN_HEADERS = { 'x-api-key': TEST_ENV.ADMIN_API_KEY };

/** A WhatsApp Cloud API webhook body carrying the given messages. */
export function whatsAppWebhook(messages: Record<string, unknown>[]): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages } }] }],
  });
}

export function signature(body: string, secret = TEST_ENV.WHATSAPP_APP_SECRET!): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Posts a correctly signed webhook, as Meta would. */
export function postWebhook(http: TestApp['http'], body: string) {
  return http
    .post('/api/v1/webhooks/whatsapp')
    .set('Content-Type', 'application/json')
    .set(SIGNATURE_HEADER, signature(body))
    .send(body);
}

let sequence = 0;
export const textFrom = (from: string, text: string) => ({
  from,
  id: `wamid.${++sequence}`,
  timestamp: '1760000000',
  type: 'text',
  text: { body: text },
});
