import { IssueType } from './issue-type.enum.js';

export interface ContactChannel {
  name: string;
  detail: string;
}

export interface ComplaintGuide {
  issueType: IssueType;
  title: string;
  /** Plain statement of the worker's right, in English; the agent explains it in Urdu. */
  right: string;
  documents: string[];
  steps: string[];
  channels: ContactChannel[];
}

/** Official MOHRE routes (PRD: Knowledge base). Haqdar guides workers here; it never files for them. */
export const MOHRE_CHANNELS: ContactChannel[] = [
  { name: 'MOHRE app', detail: 'Labour complaint service in the MOHRE smartphone app' },
  { name: 'MOHRE call centre', detail: '600590000' },
  { name: 'MOHRE service centres', detail: 'Tas-heel and Tawafuq business service centres' },
];

const BASE_DOCUMENTS = [
  'Emirates ID or residence visa',
  'Passport copy',
  'Work permit or labour card',
  'Employment contract or offer letter',
];

const FILE_STEPS = [
  'Open the MOHRE app or call 600590000 and choose to file a labour complaint',
  'Describe the problem and attach the documents',
  'Save the complaint number you receive',
  'Keep working normally and keep copies of every message with your employer',
  'Follow up with MOHRE if you hear nothing within 14 days',
];

const guide = (issueType: IssueType, title: string, right: string, extraDocuments: string[] = []): ComplaintGuide => ({
  issueType,
  title,
  right,
  documents: [...BASE_DOCUMENTS, ...extraDocuments],
  steps: FILE_STEPS,
  channels: MOHRE_CHANNELS,
});

const GUIDES: Record<IssueType, ComplaintGuide> = {
  [IssueType.UnpaidSalary]: guide(
    IssueType.UnpaidSalary,
    'Late or unpaid salary',
    'Salary must be paid on time through the Wage Protection System (WPS).',
    ['Bank statements or salary slips showing missing payments'],
  ),
  [IssueType.UnpaidOvertime]: guide(
    IssueType.UnpaidOvertime,
    'Unpaid overtime',
    'Overtime is paid at the basic hourly wage plus 25%, or plus 50% between 10pm and 4am.',
    ['Record of extra hours worked (dates and times)', 'Salary slips'],
  ),
  [IssueType.EndOfService]: guide(
    IssueType.EndOfService,
    'End-of-service gratuity',
    'After one year of service the worker is owed gratuity of 21 days of basic salary per year for the first 5 years and 30 days per year after.',
    ['Resignation or termination letter', 'Final settlement statement if received'],
  ),
  [IssueType.PassportHeld]: guide(
    IssueType.PassportHeld,
    'Passport kept by employer',
    "An employer may not keep a worker's passport.",
  ),
  [IssueType.RecruitmentFees]: guide(
    IssueType.RecruitmentFees,
    'Recruitment fees charged',
    'Recruitment fees are paid by the employer, not the worker.',
    ['Receipts or messages showing fees paid'],
  ),
  [IssueType.ContractMismatch]: guide(
    IssueType.ContractMismatch,
    'Job differs from the contract',
    'The job, salary and terms must match the contract registered with MOHRE.',
    ['Offer letter signed before arrival'],
  ),
  [IssueType.UnsafeConditions]: guide(
    IssueType.UnsafeConditions,
    'Unsafe work or housing',
    'Employers must provide safe working conditions and follow the midday work break in summer.',
    ['Photos of the conditions if safe to take'],
  ),
  [IssueType.Other]: guide(IssueType.Other, 'Other labour problem', 'MOHRE handles all labour disputes.'),
};

export function complaintGuideFor(issueType: IssueType): ComplaintGuide {
  return GUIDES[issueType];
}

export function allComplaintGuides(): ComplaintGuide[] {
  return Object.values(GUIDES);
}
