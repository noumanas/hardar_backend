import type { z } from 'zod';

import type { IssueType } from '../../complaints/domain/issue-type.enum.js';

export interface AgentContext {
  workerId: string;
  conversationId: string;
}

export interface ToolOutput {
  /** Serialised to JSON and returned to the model as the tool result. */
  result: unknown;
  /** Law references the reply is based on (PRD: every legal answer cites the article). */
  citations?: string[];
  /** Tags the conversation for the admin dashboard's issue breakdown. */
  issueType?: IssueType;
}

/**
 * One capability the agent may call. Each tool is a small adapter over an application
 * service; the model never computes money or decides legality itself.
 */
export interface AgentTool<TSchema extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TSchema;
  execute(input: z.infer<TSchema>, context: AgentContext): Promise<ToolOutput>;
}

/** Multi-provider token: every registered tool is injected into the runner as a list. */
export const AGENT_TOOLS = Symbol('AGENT_TOOLS');

/** Optional override of the runner's system prompt (the WhatsApp prompt is the default). */
export const AGENT_INSTRUCTIONS = Symbol('AGENT_INSTRUCTIONS');
