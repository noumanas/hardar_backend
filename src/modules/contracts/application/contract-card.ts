import { ContractFlagCode, type ContractFlag, type ContractTerms } from '../domain/contract-terms.js';

const UNKNOWN = 'معلوم نہیں';

const FLAG_LABELS: Record<ContractFlagCode, string> = {
  [ContractFlagCode.HoursPerDayAboveLimit]: 'روزانہ کام کے گھنٹے قانونی حد سے زیادہ ہیں',
  [ContractFlagCode.HoursPerWeekAboveLimit]: 'ہفتے کے کام کے گھنٹے قانونی حد سے زیادہ ہیں',
  [ContractFlagCode.ProbationTooLong]: 'پروبیشن کی مدت قانونی حد سے لمبی ہے',
  [ContractFlagCode.AnnualLeaveBelowMinimum]: 'سالانہ چھٹی قانون سے کم ہے',
  [ContractFlagCode.NoticePeriodOutOfRange]: 'نوٹس کی مدت قانونی حد سے باہر ہے',
  [ContractFlagCode.BasicSalaryMissing]: 'بنیادی تنخواہ لکھی نہیں ہے',
  [ContractFlagCode.EndDateMissing]: 'معاہدے کے ختم ہونے کی تاریخ لکھی نہیں ہے',
};

const money = (amount: number | null, currency: string | null): string =>
  amount === null ? UNKNOWN : `${currency ?? 'AED'} ${amount.toLocaleString('en-US')}`;

const withUnit = (value: number | null, unit: string): string => (value === null ? UNKNOWN : `${value} ${unit}`);

/**
 * The text card sent with the voice summary (PRD Flow B), built in code so the
 * numbers shown to the worker are exactly the extracted ones.
 */
export function formatContractCard(terms: ContractTerms, flags: ContractFlag[]): string {
  const lines = [
    'معاہدے کا خلاصہ',
    `بنیادی تنخواہ: ${money(terms.basicMonthlySalary, terms.currency)}`,
    `الاؤنس: ${money(terms.monthlyAllowances, terms.currency)}`,
    `روزانہ کام: ${withUnit(terms.workingHoursPerDay, 'گھنٹے')}`,
    `سالانہ چھٹی: ${withUnit(terms.annualLeaveDays, 'دن')}`,
    `پروبیشن: ${withUnit(terms.probationMonths, 'ماہ')}`,
    `نوٹس کی مدت: ${withUnit(terms.noticePeriodDays, 'دن')}`,
    `شروع: ${terms.startDate ?? UNKNOWN} · ختم: ${terms.endDate ?? UNKNOWN}`,
  ];

  if (flags.length > 0) {
    lines.push('', 'توجہ طلب:', ...flags.map((flag) => `- ${FLAG_LABELS[flag.code]} (${flag.articleRef})`));
  }
  return lines.join('\n');
}
