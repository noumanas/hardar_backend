import { InvalidCalculationInputError } from './calculation.errors.js';
import { validateSalary } from './gratuity.calculator.js';
import { LABOUR_LAW } from './labour-law.constants.js';
import { aedToFils, divideRoundHalfUp, filsToAed } from './money.js';

export interface OvertimeInput {
  basicMonthlySalary: number;
  /** Overtime hours worked outside 10pm–4am. */
  normalOvertimeHours: number;
  /** Overtime hours worked between 10pm and 4am. */
  nightOvertimeHours: number;
}

export interface OvertimeResult {
  hourlyWage: number;
  normalOvertimePay: number;
  nightOvertimePay: number;
  totalOvertimePay: number;
  articleRef: string;
}

const MINUTES_PER_HOUR = 60;
const { overtime } = LABOUR_LAW;
/** Hourly wage = monthly basic / 30 days / 8 hours. */
const HOURS_PER_MONTH = BigInt(LABOUR_LAW.daysPerMonthForDailyWage * LABOUR_LAW.normalHoursPerDay);

/**
 * Overtime pay (PRD FR-9): +25% for normal overtime, +50% at night, computed in code.
 * Hours are counted in whole minutes so the result is an exact fraction rounded once.
 */
export function calculateOvertime(input: OvertimeInput): OvertimeResult {
  validateSalary(input.basicMonthlySalary);
  const normalMinutes = toMinutes(input.normalOvertimeHours, 'normalOvertimeHours');
  const nightMinutes = toMinutes(input.nightOvertimeHours, 'nightOvertimeHours');

  const salaryFils = aedToFils(input.basicMonthlySalary);
  const pay = (minutes: bigint, premiumPercent: number): bigint =>
    divideRoundHalfUp(salaryFils * BigInt(premiumPercent) * minutes, HOURS_PER_MONTH * 100n * BigInt(MINUTES_PER_HOUR));

  const normalPay = pay(normalMinutes, overtime.normalPremiumPercent);
  const nightPay = pay(nightMinutes, overtime.nightPremiumPercent);

  return {
    hourlyWage: filsToAed(divideRoundHalfUp(salaryFils, HOURS_PER_MONTH)),
    normalOvertimePay: filsToAed(normalPay),
    nightOvertimePay: filsToAed(nightPay),
    totalOvertimePay: filsToAed(normalPay + nightPay),
    articleRef: overtime.articleRef,
  };
}

function toMinutes(hours: number, field: string): bigint {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new InvalidCalculationInputError(`${field} must be zero or a positive number`);
  }
  return BigInt(Math.round(hours * MINUTES_PER_HOUR));
}
