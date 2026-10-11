import { LABOUR_LAW } from '../../calculators/domain/labour-law.constants.js';
import { ContractFlagCode, type ContractFlag, type ContractTerms } from './contract-terms.js';

type Rule = (terms: ContractTerms) => ContractFlag | null;

const { normalHoursPerDay, maxHoursPerWeek, probation, annualLeave, noticePeriod, workingHours, gratuity } = LABOUR_LAW;

const rules: Rule[] = [
  ({ workingHoursPerDay: hours }) =>
    hours !== null && hours > normalHoursPerDay
      ? {
          code: ContractFlagCode.HoursPerDayAboveLimit,
          field: 'workingHoursPerDay',
          found: hours,
          legalLimit: `${normalHoursPerDay} hours a day`,
          articleRef: workingHours.articleRef,
        }
      : null,

  ({ workingHoursPerDay: hours, workingDaysPerWeek: days }) =>
    hours !== null && days !== null && hours * days > maxHoursPerWeek
      ? {
          code: ContractFlagCode.HoursPerWeekAboveLimit,
          field: 'workingDaysPerWeek',
          found: hours * days,
          legalLimit: `${maxHoursPerWeek} hours a week`,
          articleRef: workingHours.articleRef,
        }
      : null,

  ({ probationMonths: months }) =>
    months !== null && months > probation.maxMonths
      ? {
          code: ContractFlagCode.ProbationTooLong,
          field: 'probationMonths',
          found: months,
          legalLimit: `${probation.maxMonths} months maximum`,
          articleRef: probation.articleRef,
        }
      : null,

  ({ annualLeaveDays: days }) =>
    days !== null && days < annualLeave.minDaysPerYear
      ? {
          code: ContractFlagCode.AnnualLeaveBelowMinimum,
          field: 'annualLeaveDays',
          found: days,
          legalLimit: `${annualLeave.minDaysPerYear} days a year`,
          articleRef: annualLeave.articleRef,
        }
      : null,

  ({ noticePeriodDays: days }) =>
    days !== null && (days < noticePeriod.minDays || days > noticePeriod.maxDays)
      ? {
          code: ContractFlagCode.NoticePeriodOutOfRange,
          field: 'noticePeriodDays',
          found: days,
          legalLimit: `${noticePeriod.minDays}–${noticePeriod.maxDays} days`,
          articleRef: noticePeriod.articleRef,
        }
      : null,

  ({ basicMonthlySalary: salary }) =>
    salary === null
      ? {
          code: ContractFlagCode.BasicSalaryMissing,
          field: 'basicMonthlySalary',
          found: null,
          legalLimit: 'basic salary must be stated (it is the base for gratuity and overtime)',
          articleRef: gratuity.articleRef,
        }
      : null,

  ({ endDate }) =>
    endDate === null
      ? {
          code: ContractFlagCode.EndDateMissing,
          field: 'endDate',
          found: null,
          legalLimit: 'contracts are fixed-term and must state an end date',
          articleRef: 'Art. 8',
        }
      : null,
];

/**
 * Checks extracted contract terms against the labour law (FR-6). Deterministic by design:
 * the LLM explains the flags to the worker but never decides what is legal.
 */
export function analyzeContract(terms: ContractTerms): ContractFlag[] {
  return rules.map((rule) => rule(terms)).filter((flag): flag is ContractFlag => flag !== null);
}
