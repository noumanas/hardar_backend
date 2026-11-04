import type { Language } from '../../workers/domain/language.js';
import { ContractFlagCode, type ContractFlag, type ContractTerms } from '../domain/contract-terms.js';

interface CardLabels {
  title: string;
  unknown: string;
  basicSalary: string;
  allowances: string;
  dailyWork: string;
  annualLeave: string;
  probation: string;
  noticePeriod: string;
  start: string;
  end: string;
  attention: string;
  hours: string;
  days: string;
  months: string;
  flags: Record<ContractFlagCode, string>;
}

const LABELS: Record<Language, CardLabels> = {
  ur: {
    title: 'معاہدے کا خلاصہ',
    unknown: 'معلوم نہیں',
    basicSalary: 'بنیادی تنخواہ',
    allowances: 'الاؤنس',
    dailyWork: 'روزانہ کام',
    annualLeave: 'سالانہ چھٹی',
    probation: 'پروبیشن',
    noticePeriod: 'نوٹس کی مدت',
    start: 'شروع',
    end: 'ختم',
    attention: 'توجہ طلب:',
    hours: 'گھنٹے',
    days: 'دن',
    months: 'ماہ',
    flags: {
      [ContractFlagCode.HoursPerDayAboveLimit]: 'روزانہ کام کے گھنٹے قانونی حد سے زیادہ ہیں',
      [ContractFlagCode.HoursPerWeekAboveLimit]: 'ہفتے کے کام کے گھنٹے قانونی حد سے زیادہ ہیں',
      [ContractFlagCode.ProbationTooLong]: 'پروبیشن کی مدت قانونی حد سے لمبی ہے',
      [ContractFlagCode.AnnualLeaveBelowMinimum]: 'سالانہ چھٹی قانون سے کم ہے',
      [ContractFlagCode.NoticePeriodOutOfRange]: 'نوٹس کی مدت قانونی حد سے باہر ہے',
      [ContractFlagCode.BasicSalaryMissing]: 'بنیادی تنخواہ لکھی نہیں ہے',
      [ContractFlagCode.EndDateMissing]: 'معاہدے کے ختم ہونے کی تاریخ لکھی نہیں ہے',
    },
  },
  hi: {
    title: 'अनुबंध का सार',
    unknown: 'पता नहीं',
    basicSalary: 'मूल वेतन',
    allowances: 'भत्ता',
    dailyWork: 'रोज़ाना काम',
    annualLeave: 'सालाना छुट्टी',
    probation: 'प्रोबेशन',
    noticePeriod: 'नोटिस की अवधि',
    start: 'शुरू',
    end: 'ख़त्म',
    attention: 'ध्यान दें:',
    hours: 'घंटे',
    days: 'दिन',
    months: 'महीने',
    flags: {
      [ContractFlagCode.HoursPerDayAboveLimit]: 'रोज़ाना काम के घंटे क़ानूनी सीमा से ज़्यादा हैं',
      [ContractFlagCode.HoursPerWeekAboveLimit]: 'हफ़्ते के काम के घंटे क़ानूनी सीमा से ज़्यादा हैं',
      [ContractFlagCode.ProbationTooLong]: 'प्रोबेशन की अवधि क़ानूनी सीमा से लंबी है',
      [ContractFlagCode.AnnualLeaveBelowMinimum]: 'सालाना छुट्टी क़ानून से कम है',
      [ContractFlagCode.NoticePeriodOutOfRange]: 'नोटिस की अवधि क़ानूनी सीमा से बाहर है',
      [ContractFlagCode.BasicSalaryMissing]: 'मूल वेतन लिखा नहीं है',
      [ContractFlagCode.EndDateMissing]: 'अनुबंध ख़त्म होने की तारीख़ लिखी नहीं है',
    },
  },
  bn: {
    title: 'চুক্তির সারসংক্ষেপ',
    unknown: 'জানা নেই',
    basicSalary: 'মূল বেতন',
    allowances: 'ভাতা',
    dailyWork: 'প্রতিদিনের কাজ',
    annualLeave: 'বার্ষিক ছুটি',
    probation: 'প্রবেশন',
    noticePeriod: 'নোটিশের সময়',
    start: 'শুরু',
    end: 'শেষ',
    attention: 'লক্ষ্য করুন:',
    hours: 'ঘণ্টা',
    days: 'দিন',
    months: 'মাস',
    flags: {
      [ContractFlagCode.HoursPerDayAboveLimit]: 'প্রতিদিনের কাজের ঘণ্টা আইনের সীমার বেশি',
      [ContractFlagCode.HoursPerWeekAboveLimit]: 'সপ্তাহের কাজের ঘণ্টা আইনের সীমার বেশি',
      [ContractFlagCode.ProbationTooLong]: 'প্রবেশনের সময় আইনের সীমার চেয়ে লম্বা',
      [ContractFlagCode.AnnualLeaveBelowMinimum]: 'বার্ষিক ছুটি আইনের চেয়ে কম',
      [ContractFlagCode.NoticePeriodOutOfRange]: 'নোটিশের সময় আইনের সীমার বাইরে',
      [ContractFlagCode.BasicSalaryMissing]: 'মূল বেতন লেখা নেই',
      [ContractFlagCode.EndDateMissing]: 'চুক্তি শেষের তারিখ লেখা নেই',
    },
  },
  en: {
    title: 'Contract summary',
    unknown: 'Not stated',
    basicSalary: 'Basic salary',
    allowances: 'Allowances',
    dailyWork: 'Daily work',
    annualLeave: 'Annual leave',
    probation: 'Probation',
    noticePeriod: 'Notice period',
    start: 'Start',
    end: 'End',
    attention: 'Please check:',
    hours: 'hours',
    days: 'days',
    months: 'months',
    flags: {
      [ContractFlagCode.HoursPerDayAboveLimit]: 'Daily working hours are above the legal limit',
      [ContractFlagCode.HoursPerWeekAboveLimit]: 'Weekly working hours are above the legal limit',
      [ContractFlagCode.ProbationTooLong]: 'Probation is longer than the legal limit',
      [ContractFlagCode.AnnualLeaveBelowMinimum]: 'Annual leave is below the legal minimum',
      [ContractFlagCode.NoticePeriodOutOfRange]: 'Notice period is outside the legal range',
      [ContractFlagCode.BasicSalaryMissing]: 'Basic salary is not written',
      [ContractFlagCode.EndDateMissing]: 'Contract end date is not written',
    },
  },
};

/**
 * The text card sent with the voice summary (PRD Flow B), built in code so the
 * numbers shown to the worker are exactly the extracted ones.
 */
export function formatContractCard(terms: ContractTerms, flags: ContractFlag[], language: Language = 'ur'): string {
  const l = LABELS[language];
  const money = (amount: number | null): string =>
    amount === null ? l.unknown : `${terms.currency ?? 'AED'} ${amount.toLocaleString('en-US')}`;
  const withUnit = (value: number | null, unit: string): string => (value === null ? l.unknown : `${value} ${unit}`);

  const lines = [
    l.title,
    `${l.basicSalary}: ${money(terms.basicMonthlySalary)}`,
    `${l.allowances}: ${money(terms.monthlyAllowances)}`,
    `${l.dailyWork}: ${withUnit(terms.workingHoursPerDay, l.hours)}`,
    `${l.annualLeave}: ${withUnit(terms.annualLeaveDays, l.days)}`,
    `${l.probation}: ${withUnit(terms.probationMonths, l.months)}`,
    `${l.noticePeriod}: ${withUnit(terms.noticePeriodDays, l.days)}`,
    `${l.start}: ${terms.startDate ?? l.unknown} · ${l.end}: ${terms.endDate ?? l.unknown}`,
  ];

  if (flags.length > 0) {
    lines.push('', l.attention, ...flags.map((flag) => `- ${l.flags[flag.code]} (${flag.articleRef})`));
  }
  return lines.join('\n');
}
