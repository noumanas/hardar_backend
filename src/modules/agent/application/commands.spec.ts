import { isDeleteCommand, normalize, parseConsentAnswer } from './commands.js';

describe('commands', () => {
  it('normalises case, whitespace and Latin and Urdu punctuation', () => {
    expect(normalize('  Haan!!  ')).toBe('haan');
    expect(normalize('جی ہاں۔')).toBe('جی ہاں');
    expect(normalize('ٹھیک ہے؟')).toBe('ٹھیک ہے');
  });

  it.each(['ہاں', 'جی', 'Haan', 'ji', 'yes', 'OK.', '1'])('reads %j as consent', (answer) => {
    expect(parseConsentAnswer(answer)).toBe(true);
  });

  it.each(['نہیں', 'Nahi', 'no', '2'])('reads %j as refusal', (answer) => {
    expect(parseConsentAnswer(answer)).toBe(false);
  });

  it.each(['salam', 'what is this?', 'ہاں لیکن پہلے بتائیں'])('reads %j as neither', (answer) => {
    expect(parseConsentAnswer(answer)).toBeNull();
  });

  it.each(['ڈیٹا ختم کریں', 'میرا ڈیٹا حذف کریں', 'Delete my data', 'data khatam karein'])(
    'recognises the delete command %j',
    (text) => {
      expect(isDeleteCommand(text)).toBe(true);
    },
  );

  it('does not treat a sentence that mentions deleting as the command', () => {
    expect(isDeleteCommand('Should I delete my data from the company phone?')).toBe(false);
  });
});
