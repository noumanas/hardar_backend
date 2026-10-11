import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp, DOCS_PATH } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap(): Promise<void> {
  // rawBody is needed to verify WhatsApp webhook signatures over the exact bytes Meta sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
  configureApp(app);

  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API on http://localhost:${port}/${API_PREFIX}`);
  logger.log(`Swagger docs on http://localhost:${port}/${DOCS_PATH}`);
}

await bootstrap();
