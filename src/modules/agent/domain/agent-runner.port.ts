import type { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { ToolCallRecord } from '../../conversations/domain/message.entity.js';
import type { AgentContext } from './agent-tool.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentRunInput {
  history: ConversationTurn[];
  message: string;
  context: AgentContext;
}

export interface AgentRunResult {
  /** The reply in Urdu, or `null` when the model produced none (e.g. it declined). */
  text: string | null;
  toolCalls: ToolCallRecord[];
  citations: string[];
  issueTypes: IssueType[];
}

/** Runs one agent turn: the model reasons, calls tools as needed and writes the reply. */
export abstract class AgentRunner {
  abstract run(input: AgentRunInput): Promise<AgentRunResult>;
}

/**
 * The agent behind the website's live demo: the same loop and safety rules, its own
 * instructions, and only the tools that need no stored worker (law search, calculators,
 * complaint guides).
 */
export const DEMO_AGENT_RUNNER = Symbol('DEMO_AGENT_RUNNER');
