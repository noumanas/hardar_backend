import { createTestApp, type TestApp } from './support/test-app.js';

describe('Calculators API (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  describe('POST /api/v1/calculators/gratuity', () => {
    it('computes end-of-service gratuity', async () => {
      const { body } = await t.http
        .post('/api/v1/calculators/gratuity')
        .send({ basicMonthlySalary: 1500, startDate: '2019-03-01', endDate: '2025-03-01' })
        .expect(200);

      expect(body).toEqual({
        eligible: true,
        serviceDays: 2192,
        serviceYears: 6.01,
        dailyWage: 50,
        gratuityDays: 135.16,
        amount: 6758.22,
        cappedAtTwoYearsSalary: false,
        articleRef: 'Art. 51',
      });
    });

    it('rejects end dates before start dates with a 400', async () => {
      const { body } = await t.http
        .post('/api/v1/calculators/gratuity')
        .send({ basicMonthlySalary: 1500, startDate: '2025-03-01', endDate: '2019-03-01' })
        .expect(400);

      expect(body).toMatchObject({ statusCode: 400, message: 'endDate must not be before startDate' });
    });

    it('validates the body and lists every problem', async () => {
      const { body } = await t.http
        .post('/api/v1/calculators/gratuity')
        .send({ basicMonthlySalary: -1, startDate: 'yesterday', extra: true })
        .expect(400);

      expect(body.message).toEqual(
        expect.arrayContaining([
          'property extra should not exist',
          'basicMonthlySalary must be a positive number',
          'startDate must be a valid ISO 8601 date string',
          'endDate must be a valid ISO 8601 date string',
        ]),
      );
    });
  });

  describe('POST /api/v1/calculators/overtime', () => {
    it('computes normal and night overtime', async () => {
      const { body } = await t.http
        .post('/api/v1/calculators/overtime')
        .send({ basicMonthlySalary: 1500, normalOvertimeHours: 10, nightOvertimeHours: 4 })
        .expect(200);

      expect(body).toEqual({
        hourlyWage: 6.25,
        normalOvertimePay: 78.13,
        nightOvertimePay: 37.5,
        totalOvertimePay: 115.63,
        articleRef: 'Art. 19',
      });
    });

    it('rejects negative hours', async () => {
      await t.http
        .post('/api/v1/calculators/overtime')
        .send({ basicMonthlySalary: 1500, normalOvertimeHours: -2, nightOvertimeHours: 0 })
        .expect(400);
    });
  });
});
