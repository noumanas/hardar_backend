import { contractTerms } from '../../../../test/support/builders.js';
import { analyzeContract } from '../domain/contract-analyzer.js';
import { formatContractCard } from './contract-card.js';

describe('formatContractCard', () => {
  it('shows every key term with its unit', () => {
    const card = formatContractCard(contractTerms(), []);

    expect(card).toContain('بنیادی تنخواہ: AED 1,500');
    expect(card).toContain('الاؤنس: AED 300');
    expect(card).toContain('روزانہ کام: 8 گھنٹے');
    expect(card).toContain('شروع: 2025-01-01 · ختم: 2027-01-01');
    expect(card).not.toContain('توجہ طلب');
  });

  it('marks terms that were not found as unknown and defaults the currency to AED', () => {
    const card = formatContractCard(contractTerms({ currency: null, annualLeaveDays: null, endDate: null }), []);

    expect(card).toContain('بنیادی تنخواہ: AED 1,500');
    expect(card).toContain('سالانہ چھٹی: معلوم نہیں');
    expect(card).toContain('ختم: معلوم نہیں');
  });

  it('lists each problem with the rule it breaks', () => {
    const terms = contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4, basicMonthlySalary: null });
    const card = formatContractCard(terms, analyzeContract(terms));

    expect(card).toContain('توجہ طلب:');
    expect(card).toContain('- روزانہ کام کے گھنٹے قانونی حد سے زیادہ ہیں (Art. 17)');
    expect(card).toContain('بنیادی تنخواہ: معلوم نہیں');
  });
});

describe("formatContractCard in the worker's language", () => {
  it.each([
    ['hi', 'मूल वेतन: AED 1,500', 'रोज़ाना काम के घंटे क़ानूनी सीमा से ज़्यादा हैं (Art. 17)'],
    ['bn', 'মূল বেতন: AED 1,500', 'প্রতিদিনের কাজের ঘণ্টা আইনের সীমার বেশি (Art. 17)'],
    ['en', 'Basic salary: AED 1,500', 'Daily working hours are above the legal limit (Art. 17)'],
  ] as const)('writes the card in %s', (language, salaryLine, flagLine) => {
    const terms = contractTerms({ workingHoursPerDay: 10, workingDaysPerWeek: 4 });
    const card = formatContractCard(terms, analyzeContract(terms), language);

    expect(card).toContain(salaryLine);
    expect(card).toContain(flagLine);
    expect(card).not.toContain('بنیادی تنخواہ');
  });
});
