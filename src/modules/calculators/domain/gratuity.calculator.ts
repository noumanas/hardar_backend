import { InvalidCalculationInputError } from './calculation.errors.js';
import { LABOUR_LAW } from './labour-law.constants.js';
import { aedToFils, divideRoundHalfUp, filsToAed } from './money.js';

export interface GratuityInput {
  basicMonthlySalary: number;
  /** ISO date (YYYY-MM-DD) the employment started. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) the employment ended or will end. */
  endDate: string;
}

export interface GratuityResult {
  eligible: boolean;
  serviceDays: number;
  serviceYears: number;
  dailyWage: number;
  gratuityDays: number;
  amount: number;
  cappedAtTwoYearsSalary: boolean;
  articleRef: string;
}

const MS_PER_DAY = 86_400_000;
const { gratuity } = LABOUR_LAW;
const FIRST_TIER_DAYS = BigInt(gratuity.firstTierYears * gratuity.daysPerYear);

/**
 * End-of-service gratuity (PRD FR-8), computed in code, never by the LLM.
 *
 * gratuity = daily wage × (21 days per year for the first 5 years + 30 days per year after),
 * pro-rated for part years, payable after one year of service, capped at two years' salary.
 * The whole sum is evaluated as one exact fraction and rounded once.
 */
export function calculateGratuity(input: GratuityInput): GratuityResult {
  validateSalary(input.basicMonthlySalary);
  const serviceDays = daysBetween(input.startDate, input.endDate);

  const salaryFils = aedToFils(input.basicMonthlySalary);
  const dailyWage = filsToAed(divideRoundHalfUp(salaryFils, BigInt(LABOUR_LAW.daysPerMonthForDailyWage)));
  const serviceYears = round2(serviceDays / gratuity.daysPerYear);
  const base = { serviceDays, serviceYears, dailyWage, articleRef: gratuity.articleRef };

  if (serviceDays < gratuity.minimumServiceDays) {
    return { ...base, eligible: false, gratuityDays: 0, amount: 0, cappedAtTwoYearsSalary: false };
  }

  const days = BigInt(serviceDays);
  const firstTierDays = days < FIRST_TIER_DAYS ? days : FIRST_TIER_DAYS;
  const laterDays = days - firstTierDays;

  // Entitlement in "salary days × service days", over (days per year × days per month).
  const entitlement =
    firstTierDays * BigInt(gratuity.firstTierDaysPerYear) + laterDays * BigInt(gratuity.laterDaysPerYear);
  const denominator = BigInt(gratuity.daysPerYear * LABOUR_LAW.daysPerMonthForDailyWage);

  const uncappedFils = divideRoundHalfUp(salaryFils * entitlement, denominator);
  const capFils = salaryFils * BigInt(gratuity.capInMonths);
  const capped = uncappedFils > capFils;

  return {
    ...base,
    eligible: true,
    gratuityDays: round2(Number(entitlement) / gratuity.daysPerYear),
    amount: filsToAed(capped ? capFils : uncappedFils),
    cappedAtTwoYearsSalary: capped,
  };
}

function daysBetween(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso, 'startDate');
  const end = parseIsoDate(endIso, 'endDate');
  if (end < start) throw new InvalidCalculationInputError('endDate must not be before startDate');
  return Math.round((end - start) / MS_PER_DAY);
}

function parseIsoDate(value: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidCalculationInputError(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new InvalidCalculationInputError(`${field} is not a real calendar date`);
  }
  return time;
}

export function validateSalary(salary: number): void {
  if (!Number.isFinite(salary) || salary <= 0) {
    throw new InvalidCalculationInputError('basicMonthlySalary must be a positive number');
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
