import type { Language } from '../../workers/domain/language.js';

/** Lowercases, trims and strips punctuation (Latin, Urdu, Hindi and Bengali) so short replies compare reliably. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?؟،۔।"'“”‘’()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const YES = new Set([
  // Urdu
  'ہاں',
  'ہاں جی',
  'جی',
  'جی ہاں',
  'ہا',
  'ٹھیک ہے',
  // Roman Urdu / Hindi
  'haan',
  'han',
  'haa',
  'ha',
  'ji',
  'jee',
  'theek hai',
  'thik hai',
  // Hindi
  'हाँ',
  'हां',
  'हा',
  'जी',
  'जी हाँ',
  'जी हां',
  'ठीक है',
  // Bengali
  'হ্যাঁ',
  'হ্যা',
  'হাঁ',
  'জি',
  'জি হ্যাঁ',
  'ঠিক আছে',
  // English
  'yes',
  'y',
  'ok',
  'okay',
  '1',
]);
const NO = new Set([
  'نہیں',
  'نہیں جی',
  'جی نہیں',
  'nahi',
  'nahin',
  'nai',
  'नहीं',
  'नही',
  'जी नहीं',
  'না',
  'জি না',
  'no',
  'n',
  '2',
]);

/**
 * Exact phrases only: deleting data can't be undone, so a sentence that merely mentions
 * deleting something is never treated as the command.
 */
const DELETE_COMMANDS: Record<string, Language> = {
  'ڈیٹا ختم کریں': 'ur',
  'میرا ڈیٹا ختم کریں': 'ur',
  'ڈیٹا حذف کریں': 'ur',
  'میرا ڈیٹا حذف کریں': 'ur',
  'data khatam karein': 'ur',
  'data khatam karen': 'ur',
  'डेटा मिटाएं': 'hi',
  'डेटा मिटाएँ': 'hi',
  'मेरा डेटा मिटाएं': 'hi',
  'मेरा डेटा मिटाएँ': 'hi',
  'डेटा हटाएं': 'hi',
  'मेरा डेटा हटाएं': 'hi',
  'ডেটা মুছুন': 'bn',
  'আমার ডেটা মুছুন': 'bn',
  'ডাটা মুছুন': 'bn',
  'আমার ডাটা মুছুন': 'bn',
  'delete my data': 'en',
  'delete data': 'en',
};

/** Typed at any time to pick another language. */
const LANGUAGE_COMMANDS = new Set([
  'زبان',
  'زبان بدلیں',
  'zaban',
  'zuban',
  'भाषा',
  'भाषा बदलें',
  'bhasha',
  'ভাষা',
  'ভাষা বদলান',
  'language',
  'change language',
]);

/** Answers to the language menu: its number (in any of the scripts' digits) or the language's name. */
const LANGUAGE_CHOICES: Record<string, Language> = {
  '1': 'ur',
  '۱': 'ur',
  '١': 'ur',
  '१': 'ur',
  '১': 'ur',
  urdu: 'ur',
  اردو: 'ur',
  اُردو: 'ur',
  उर्दू: 'ur',
  '2': 'hi',
  '۲': 'hi',
  '٢': 'hi',
  '२': 'hi',
  '২': 'hi',
  hindi: 'hi',
  हिन्दी: 'hi',
  हिंदी: 'hi',
  ہندی: 'hi',
  '3': 'bn',
  '۳': 'bn',
  '٣': 'bn',
  '३': 'bn',
  '৩': 'bn',
  bangla: 'bn',
  bengali: 'bn',
  বাংলা: 'bn',
  بنگالی: 'bn',
  '4': 'en',
  '۴': 'en',
  '٤': 'en',
  '४': 'en',
  '৪': 'en',
  english: 'en',
  انگریزی: 'en',
  अंग्रेज़ी: 'en',
  इंग्लिश: 'en',
  ইংরেজি: 'en',
};

/** Reads a consent answer: `true` for yes, `false` for no, `null` when it is neither. */
export function parseConsentAnswer(text: string): boolean | null {
  const answer = normalize(text);
  if (YES.has(answer)) return true;
  if (NO.has(answer)) return false;
  return null;
}

/** FR-14: the worker's command to delete everything Haqdar stores about them, and the language it was typed in. */
export function parseDeleteCommand(text: string): Language | null {
  return DELETE_COMMANDS[normalize(text)] ?? null;
}

export function isLanguageCommand(text: string): boolean {
  return LANGUAGE_COMMANDS.has(normalize(text));
}

/**
 * Reads an answer to the language menu: "2", "hindi", or a menu line copied back ("2 हिन्दी").
 * `null` otherwise, so a first message such as "2 mahine se salary nahi mili" is not a choice.
 */
export function parseLanguageChoice(text: string): Language | null {
  const answer = normalize(text);
  const whole = LANGUAGE_CHOICES[answer];
  if (whole) return whole;

  const [first, ...rest] = answer.split(' ');
  const byNumber = LANGUAGE_CHOICES[first];
  const byName = LANGUAGE_CHOICES[rest.join(' ')];
  return byNumber && byNumber === byName ? byNumber : null;
}
