import { formatPhone, maskPhone, normalizePhone } from './phone-number.js';

describe('phone numbers', () => {
  it.each([
    ['971501234567', '+971 ••• 4567'],
    ['923001234567', '+92 ••• 4567'],
    ['8801712345678', '+880 ••• 5678'],
    ['919876543210', '+91 ••• 3210'],
    ['15556543317', '+1 ••• 3317'],
    ['4917612345678', '+49 ••• 5678'],
  ])('masks %s as %s', (phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });

  it('never shows more than the code and the last four digits', () => {
    expect(maskPhone('971501234567')).not.toContain('5012');
  });

  it('formats a revealed number with its calling code', () => {
    expect(formatPhone('971501234567')).toBe('+971 501234567');
  });

  it.each([
    ['+971 50-123 4567', '971501234567'],
    ['00971501234567', '971501234567'],
    ['(971) 50 123 4567', '971501234567'],
  ])('normalises %j', (input, digits) => {
    expect(normalizePhone(input)).toBe(digits);
  });
});
