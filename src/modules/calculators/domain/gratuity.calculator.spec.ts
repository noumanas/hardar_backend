import { InvalidCalculationInputError } from './calculation.errors.js';
import { calculateGratuity } from './gratuity.calculator.js';

describe('calculateGratuity', () => {
  const basic = { basicMonthlySalary: 1500 };

  it('pays nothing before one full year of service', () => {
    const result = calculateGratuity({ ...basic, startDate: '2025-01-01', endDate: '2025-12-31' });

    expect(result).toMatchObject({ eligible: false, serviceDays: 364, gratuityDays: 0, amount: 0, dailyWage: 50 });
  });

  it('treats a same-day start and end as zero service', () => {
    expect(calculateGratuity({ ...basic, startDate: '2025-05-05', endDate: '2025-05-05' })).toMatchObject({
      eligible: false,
      serviceDays: 0,
    });
  });

  it('pays 21 days of basic salary for exactly one year', () => {
    const result = calculateGratuity({ ...basic, startDate: '2025-01-01', endDate: '2026-01-01' });

    expect(result).toMatchObject({ eligible: true, serviceDays: 365, gratuityDays: 21, amount: 1050 });
  });

  it('pays 21 days per year for the first five years (5 × 21 = 105 days)', () => {
    // 2021-01-01 → 2025-12-31 is exactly 1825 days.
    const result = calculateGratuity({ ...basic, startDate: '2021-01-01', endDate: '2025-12-31' });

    expect(result).toMatchObject({ serviceDays: 1825, serviceYears: 5, gratuityDays: 105, amount: 5250 });
  });

  it('pays 30 days per year after five years, pro rata (PRD example: about AED 6,750 for 6 years)', () => {
    // 2192 days = 1825 days at 21 + 367 days at 30 → 49 335 / 365 = 135.16 salary days.
    const result = calculateGratuity({ ...basic, startDate: '2019-03-01', endDate: '2025-03-01' });

    expect(result).toEqual({
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

  it('caps the total at two years of basic salary', () => {
    const result = calculateGratuity({ ...basic, startDate: '1995-01-01', endDate: '2025-01-01' });

    expect(result).toMatchObject({ amount: 36_000, cappedAtTwoYearsSalary: true });
  });

  it('rounds the daily wage and amount half-up to whole fils', () => {
    const result = calculateGratuity({ basicMonthlySalary: 1000, startDate: '2025-01-01', endDate: '2026-01-01' });

    expect(result.dailyWage).toBe(33.33);
    expect(result.amount).toBe(700); // 1000 × 21 / 30, computed exactly before rounding
  });

  it.each([
    ['endDate before startDate', '2025-02-01', '2025-01-01', 'endDate must not be before startDate'],
    ['a non-ISO start date', '01/02/2025', '2025-03-01', 'startDate must be an ISO date (YYYY-MM-DD)'],
    ['an impossible end date', '2025-01-01', '2025-02-30', 'endDate is not a real calendar date'],
  ])('rejects %s', (_case, startDate, endDate, message) => {
    expect(() => calculateGratuity({ ...basic, startDate, endDate })).toThrow(
      new InvalidCalculationInputError(message),
    );
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])('rejects a basic salary of %s', (basicMonthlySalary) => {
    expect(() => calculateGratuity({ basicMonthlySalary, startDate: '2020-01-01', endDate: '2025-01-01' })).toThrow(
      'basicMonthlySalary must be a positive number',
    );
  });
});
