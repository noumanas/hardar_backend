import {
  isLanguageCommand,
  normalize,
  parseConsentAnswer,
  parseDeleteCommand,
  parseLanguageChoice,
} from './commands.js';

describe('commands', () => {
  it('normalises case, whitespace and Latin, Urdu, Hindi and Bengali punctuation', () => {
    expect(normalize('  Haan!!  ')).toBe('haan');
    expect(normalize('جی ہاں۔')).toBe('جی ہاں');
    expect(normalize('ٹھیک ہے؟')).toBe('ٹھیک ہے');
    expect(normalize('हाँ।')).toBe('हाँ');
  });

  it.each(['ہاں', 'جی', 'Haan', 'ji', 'yes', 'OK.', '1', 'हाँ', 'जी हां', 'হ্যাঁ', 'ঠিক আছে'])(
    'reads %j as consent',
    (answer) => {
      expect(parseConsentAnswer(answer)).toBe(true);
    },
  );

  it.each(['نہیں', 'Nahi', 'no', '2', 'नहीं', 'না'])('reads %j as refusal', (answer) => {
    expect(parseConsentAnswer(answer)).toBe(false);
  });

  it.each(['salam', 'what is this?', 'ہاں لیکن پہلے بتائیں'])('reads %j as neither', (answer) => {
    expect(parseConsentAnswer(answer)).toBeNull();
  });

  it.each([
    ['ڈیٹا ختم کریں', 'ur'],
    ['میرا ڈیٹا حذف کریں', 'ur'],
    ['data khatam karein', 'ur'],
    ['मेरा डेटा मिटाएं', 'hi'],
    ['ডেটা মুছুন', 'bn'],
    ['Delete my data', 'en'],
  ])('recognises the delete command %j, typed in %s', (text, language) => {
    expect(parseDeleteCommand(text)).toBe(language);
  });

  it('does not treat a sentence that mentions deleting as the command', () => {
    expect(parseDeleteCommand('Should I delete my data from the company phone?')).toBeNull();
  });

  it.each([
    ['1', 'ur'],
    ['۱', 'ur'],
    ['Urdu', 'ur'],
    ['اردو', 'ur'],
    ['2', 'hi'],
    ['२', 'hi'],
    ['हिंदी', 'hi'],
    ['2. हिन्दी', 'hi'],
    ['3', 'bn'],
    ['৩', 'bn'],
    ['বাংলা', 'bn'],
    ['Bangla', 'bn'],
    ['4', 'en'],
    ['English', 'en'],
  ])('reads %j as choosing %s', (text, language) => {
    expect(parseLanguageChoice(text)).toBe(language);
  });

  it.each(['salam', 'hi', '5', '2 mahine se salary nahi mili', '1 English'])(
    'does not read %j as a language choice',
    (text) => {
      expect(parseLanguageChoice(text)).toBeNull();
    },
  );

  it.each(['language', 'زبان', 'भाषा', 'ভাষা', 'Change language'])(
    'recognises %j as asking to change language',
    (text) => {
      expect(isLanguageCommand(text)).toBe(true);
    },
  );
});
