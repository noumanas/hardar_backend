import { InvalidCalculationInputError } from './calculation.errors.js';
import { calculateOvertime } from './overtime.calculator.js';

describe('calculateOvertime', () => {
  // AED 1,500 basic → hourly wage 1500 / 30 / 8 = 6.25.
  const basic = { basicMonthlySalary: 1500 };

  it('pays normal overtime at the hourly wage plus 25%', () => {
    const result = calculateOvertime({ ...basic, normalOvertimeHours: 10, nightOvertimeHours: 0 });

    // 6.25 × 1.25 × 10 = 78.125 → 78.13 (half-up)
    expect(result).toEqual({
      hourlyWage: 6.25,
      normalOvertimePay: 78.13,
      nightOvertimePay: 0,
      totalOvertimePay: 78.13,
      articleRef: 'Art. 19',
    });
  });

  it('pays night overtime (10pm–4am) at the hourly wage plus 50%', () => {
    const result = calculateOvertime({ ...basic, normalOvertimeHours: 0, nightOvertimeHours: 4 });

    expect(result.nightOvertimePay).toBe(37.5); // 6.25 × 1.5 × 4
  });

  it('adds normal and night overtime, rounding each component once', () => {
    const result = calculateOvertime({ ...basic, normalOvertimeHours: 10, nightOvertimeHours: 4 });

    expect(result.totalOvertimePay).toBe(115.63);
  });

  it('handles part hours exactly', () => {
    const result = calculateOvertime({ ...basic, normalOvertimeHours: 1.5, nightOvertimeHours: 0 });

    expect(result.normalOvertimePay).toBe(11.72); // 6.25 × 1.25 × 1.5 = 11.71875
  });

  it('returns zero when no overtime was worked', () => {
    expect(calculateOvertime({ ...basic, normalOvertimeHours: 0, nightOvertimeHours: 0 }).totalOvertimePay).toBe(0);
  });

  it.each([
    ['normalOvertimeHours', { normalOvertimeHours: -1, nightOvertimeHours: 0 }],
    ['nightOvertimeHours', { normalOvertimeHours: 0, nightOvertimeHours: Number.NaN }],
  ])('rejects invalid %s', (field, hours) => {
    expect(() => calculateOvertime({ ...basic, ...hours })).toThrow(
      new InvalidCalculationInputError(`${field} must be zero or a positive number`),
    );
  });

  it('rejects a non-positive salary', () => {
    expect(() => calculateOvertime({ basicMonthlySalary: 0, normalOvertimeHours: 1, nightOvertimeHours: 0 })).toThrow(
      InvalidCalculationInputError,
    );
  });
});
