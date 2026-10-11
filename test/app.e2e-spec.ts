import { createTestApp, type TestApp } from './support/test-app.js';

describe('Platform (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  it('GET /health reports the database as up, outside the /api/v1 prefix', async () => {
    const response = await t.http.get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
  });

  it('serves the Swagger UI and the OpenAPI document', async () => {
    await t.http.get('/docs').expect(200).expect('content-type', /html/);
    const { body } = await t.http.get('/docs-json').expect(200);

    expect(body.info).toMatchObject({ title: 'Haqdar API', version: '0.1.0' });
    expect(body.components.securitySchemes['admin-api-key']).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    });
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/webhooks/whatsapp',
        '/api/v1/calculators/gratuity',
        '/api/v1/calculators/overtime',
        '/api/v1/complaints/guides/{issueType}',
        '/api/v1/admin/overview',
        '/api/v1/admin/knowledge/search',
        '/api/v1/admin/agent/simulate',
      ]),
    );
  });

  it('answers unknown routes with the standard error body', async () => {
    const { body } = await t.http.get('/api/v1/nope').expect(404);
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      path: '/api/v1/nope',
      timestamp: expect.any(String),
    });
  });

  it('sets security headers', async () => {
    const response = await t.http.get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });
});
