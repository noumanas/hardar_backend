import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ADMIN_SECURITY_SCHEME } from './common/decorators/admin-only.decorator.js';
import { ADMIN_API_KEY_HEADER } from './common/guards/admin-api-key.guard.js';
import { AppConfigService } from './config/app-config.service.js';
import { applyDemoRateLimits } from './modules/demo/presentation/demo-rate-limits.js';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'docs';

/** HTTP setup shared by `main.ts` and the e2e tests, so tests run the real configuration. */
export function configureApp(app: INestApplication): OpenAPIObject {
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  // Behind a CDN or load balancer the visitor's IP is in X-Forwarded-For; trust only that many hops.
  const proxyHops = config.get('TRUST_PROXY_HOPS');
  if (proxyHops > 0)
    (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set('trust proxy', proxyHops);
  app.use(
    helmet({
      // Swagger UI needs inline styles and its own scripts.
      contentSecurityPolicy: {
        directives: { 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'https:'] },
      },
    }),
  );
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    // Lets the website read how many demo requests remain and when to retry.
    exposedHeaders: ['Retry-After', 'X-Demo-Remaining', 'X-Demo-Limit-Scope'],
  });
  // Public demo AI routes: per-visitor and shared hourly limits, before any work happens.
  // After CORS, so a refusal still reaches the website with its message.
  applyDemoRateLimits(app, API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: false }),
  );
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    customSiteTitle: 'Haqdar API',
  });
  return document;
}

function buildOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Haqdar API')
    .setDescription(
      'Backend for Haqdar, the WhatsApp voice agent that helps UAE migrant workers understand their contract and ' +
        'labour rights. Public endpoints serve the calculators and complaint guides; `/admin` endpoints need the ' +
        `\`${ADMIN_API_KEY_HEADER}\` header; the WhatsApp webhook is called by Meta.`,
    )
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: ADMIN_API_KEY_HEADER }, ADMIN_SECURITY_SCHEME)
    .build();
}
