/** Key terms read from a contract or offer letter. `null` means the term was not found. */
export interface ContractTerms {
  jobTitle: string | null;
  basicMonthlySalary: number | null;
  /** Sum of monthly allowances (housing, transport, food...). */
  monthlyAllowances: number | null;
  currency: string | null;
  workingHoursPerDay: number | null;
  workingDaysPerWeek: number | null;
  annualLeaveDays: number | null;
  probationMonths: number | null;
  noticePeriodDays: number | null;
  /** ISO date (YYYY-MM-DD). */
  startDate: string | null;
  /** ISO date (YYYY-MM-DD). */
  endDate: string | null;
}

export enum ContractFlagCode {
  HoursPerDayAboveLimit = 'hours_per_day_above_limit',
  HoursPerWeekAboveLimit = 'hours_per_week_above_limit',
  ProbationTooLong = 'probation_too_long',
  AnnualLeaveBelowMinimum = 'annual_leave_below_minimum',
  NoticePeriodOutOfRange = 'notice_period_out_of_range',
  BasicSalaryMissing = 'basic_salary_missing',
  EndDateMissing = 'end_date_missing',
}

/** A term that conflicts with the law or that the worker should check (FR-6). */
export interface ContractFlag {
  code: ContractFlagCode;
  field: keyof ContractTerms;
  found: string | number | null;
  legalLimit: string;
  articleRef: string;
}
