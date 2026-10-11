/** Turns an answer in a worker's language into plain English, shown under it on the website. */
export abstract class ReplyTranslator {
  /** Returns null when no translation could be made; the answer still stands on its own. */
  abstract toEnglish(text: string): Promise<string | null>;
}

/** Text whose letters are all Latin script is treated as English already and is not translated. */
const NON_LATIN_LETTER = /(?=\p{L})\P{Script=Latin}/u;

export const needsTranslation = (text: string): boolean => NON_LATIN_LETTER.test(text);
