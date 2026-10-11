/**
 * Where a conversation stands in the admin review queue, in priority order:
 * an admin's review wins, then anything urgent or flagged needs a look, then whether
 * the worker was guided to MOHRE. Derived in SQL (see the conversation repository).
 */
export enum ConversationStatus {
  Reviewed = 'reviewed',
  NeedsReview = 'needs_review',
  GuidedToMohre = 'guided_to_mohre',
  Answered = 'answered',
}

export const CONVERSATION_STATUSES = Object.values(ConversationStatus);
