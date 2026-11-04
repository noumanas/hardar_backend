/** The languages a worker can choose on WhatsApp. Every fixed reply exists in each of them. */
export const LANGUAGES = ['ur', 'hi', 'bn', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Used before a worker has chosen, and for any stored value that is no longer offered. */
export const DEFAULT_LANGUAGE: Language = 'ur';

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

/** The worker's language, falling back to the default until they choose one. */
export const languageOf = (worker: { language: string | null }): Language =>
  isLanguage(worker.language) ? worker.language : DEFAULT_LANGUAGE;
