/** At most this many follow-up questions are offered under an answer. */
export const MAX_FOLLOW_UPS = 3;

/**
 * Suggests what the visitor might ask next, shown as tap-to-ask chips under an answer in the
 * website's live chat. Written in the answer's language, from the visitor's point of view.
 */
export abstract class FollowUpSuggester {
  /** Returns an empty list when nothing useful can be suggested; the answer stands without. */
  abstract suggest(question: string, answer: string): Promise<string[]>;
}
