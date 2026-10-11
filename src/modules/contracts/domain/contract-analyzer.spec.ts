import { contractTerms } from '../../../../test/support/builders.js';
import { analyzeContract } from './contract-analyzer.js';
import { ContractFlagCode } from './contract-terms.js';

const codesFor = (overrides: Parameters<typeof contractTerms>[0]): ContractFlagCode[] =>
  analyzeContract(contractTerms(overrides)).map((flag) => flag.code);

describe('analyzeContract', () => {
  it('raises nothing for a contract within the law', () => {
    expect(analyzeContract(contractTerms())).toEqual([]);
  });

  it('flags more than 8 hours a day, with the rule it breaks', () => {
    const [flag] = analyzeContract(contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4 }));

    expect(flag).toEqual({
      code: ContractFlagCode.HoursPerDayAboveLimit,
      field: 'workingHoursPerDay',
      found: 10,
      legalLimit: '8 hours a day',
      articleRef: 'Art. 17',
    });
  });

  it('flags more than 48 hours a week', () => {
    expect(codesFor({ workingHoursPerDay: 8, workingDaysPerWeek: 7 })).toEqual([
      ContractFlagCode.HoursPerWeekAboveLimit,
    ]);
  });

  it('flags probation longer than 6 months', () => {
    expect(codesFor({ probationMonths: 7 })).toEqual([ContractFlagCode.ProbationTooLong]);
  });

  it('flags annual leave below 30 days', () => {
    expect(codesFor({ annualLeaveDays: 21 })).toEqual([ContractFlagCode.AnnualLeaveBelowMinimum]);
  });

  it.each([15, 120])('flags a notice period of %i days', (noticePeriodDays) => {
    expect(codesFor({ noticePeriodDays })).toEqual([ContractFlagCode.NoticePeriodOutOfRange]);
  });

  it('flags a missing basic salary and a missing end date', () => {
    expect(codesFor({ basicMonthlySalary: null, endDate: null })).toEqual([
      ContractFlagCode.BasicSalaryMissing,
      ContractFlagCode.EndDateMissing,
    ]);
  });

  it('does not guess about terms that were not found', () => {
    expect(
      codesFor({
        workingHoursPerDay: null,
        workingDaysPerWeek: null,
        probationMonths: null,
        annualLeaveDays: null,
        noticePeriodDays: null,
      }),
    ).toEqual([]);
  });
});
