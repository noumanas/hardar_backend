/** Lowercases, trims and strips punctuation (Latin and Urdu) so short replies compare reliably. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?؟،۔"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const YES = new Set([
  'ہاں',
  'ہاں جی',
  'جی',
  'جی ہاں',
  'ہا',
  'ٹھیک ہے',
  'haan',
  'han',
  'haa',
  'ha',
  'ji',
  'jee',
  'yes',
  'y',
  'ok',
  'okay',
  'theek hai',
  '1',
]);
const NO = new Set(['نہیں', 'نہیں جی', 'جی نہیں', 'nahi', 'nahin', 'nai', 'no', 'n', '2']);

/**
 * Exact phrases only: deleting data can't be undone, so a sentence that merely mentions
 * deleting something is never treated as the command.
 */
const DELETE_COMMANDS = new Set([
  'ڈیٹا ختم کریں',
  'میرا ڈیٹا ختم کریں',
  'ڈیٹا حذف کریں',
  'میرا ڈیٹا حذف کریں',
  'data khatam karein',
  'data khatam karen',
  'delete my data',
  'delete data',
]);

/** Reads a consent answer: `true` for yes, `false` for no, `null` when it is neither. */
export function parseConsentAnswer(text: string): boolean | null {
  const answer = normalize(text);
  if (YES.has(answer)) return true;
  if (NO.has(answer)) return false;
  return null;
}

/** FR-14: the worker's command to delete everything Haqdar stores about them. */
export function isDeleteCommand(text: string): boolean {
  return DELETE_COMMANDS.has(normalize(text));
}
