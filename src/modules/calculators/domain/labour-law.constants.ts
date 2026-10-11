/**
 * UAE Labour Law figures used by the deterministic calculators and the contract analyzer.
 *
 * Source: Federal Decree-Law No. 33 of 2021 and its Executive Regulations.
 * The PRD marks these as approximate: every value must be checked against current
 * MOHRE material before launch. Keep all legal numbers here, nowhere else.
 */
export const LABOUR_LAW = {
  reference: 'Federal Decree-Law No. 33 of 2021',

  /** Daily wage = monthly basic salary / 30. */
  daysPerMonthForDailyWage: 30,
  normalHoursPerDay: 8,
  maxHoursPerWeek: 48,

  gratuity: {
    articleRef: 'Art. 51',
    minimumServiceDays: 365,
    daysPerYear: 365,
    /** 21 days of basic salary per year for the first 5 years. */
    firstTierYears: 5,
    firstTierDaysPerYear: 21,
    /** 30 days of basic salary per year after 5 years. */
    laterDaysPerYear: 30,
    /** Total gratuity may not exceed two years' basic salary. */
    capInMonths: 24,
  },

  overtime: {
    articleRef: 'Art. 19',
    /** Normal overtime: hourly basic wage + 25%. */
    normalPremiumPercent: 125,
    /** Night overtime (10pm to 4am): hourly basic wage + 50%. */
    nightPremiumPercent: 150,
  },

  probation: { articleRef: 'Art. 9', maxMonths: 6 },
  annualLeave: { articleRef: 'Art. 29', minDaysPerYear: 30 },
  noticePeriod: { articleRef: 'Art. 43', minDays: 30, maxDays: 90 },
  workingHours: { articleRef: 'Art. 17' },
} as const;
