/** The worker problems Haqdar recognises (PRD: Problem table). */
export enum IssueType {
  UnpaidSalary = 'unpaid_salary',
  UnpaidOvertime = 'unpaid_overtime',
  EndOfService = 'end_of_service',
  PassportHeld = 'passport_held',
  RecruitmentFees = 'recruitment_fees',
  ContractMismatch = 'contract_mismatch',
  UnsafeConditions = 'unsafe_conditions',
  Other = 'other',
}

export const ISSUE_TYPES = Object.values(IssueType);
