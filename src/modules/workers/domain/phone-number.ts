/**
 * Calling codes of the countries Haqdar's workers and pilot numbers come from, longest
 * first so "971" wins over "97". Anything else shows its first two digits as the code.
 */
const CALLING_CODES = ['880', '971', '977', '966', '974', '968', '973', '965', '92', '91', '94', '63', '62', '44', '1'];

const digitsOf = (phone: string): string => phone.replace(/\D/g, '');

/** Splits a WhatsApp number (digits, international format) into its calling code and the rest. */
function split(phone: string): { code: string; rest: string } {
  const digits = digitsOf(phone);
  const code = CALLING_CODES.find((c) => digits.startsWith(c) && digits.length - c.length >= 6) ?? digits.slice(0, 2);
  return { code, rest: digits.slice(code.length) };
}

/**
 * What admins see by default: the country and the last four digits, e.g. "+971 ••• 4567".
 * Enough to tell numbers apart and match a worker who calls in; a screenshot exposes no one.
 */
export function maskPhone(phone: string): string {
  const { code, rest } = split(phone);
  return `+${code} ••• ${rest.slice(-4)}`;
}

/** The full number, for an admin who chose to reveal it: "+971 501234567". */
export function formatPhone(phone: string): string {
  const { code, rest } = split(phone);
  return `+${code} ${rest}`;
}

/** Normalises a number an admin typed ("+971 50-123 4567", "00971…") to WhatsApp's digits-only form. */
export function normalizePhone(input: string): string {
  return digitsOf(input).replace(/^00/, '');
}
