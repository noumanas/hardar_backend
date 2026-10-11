import {
  FinishReason,
  FunctionCallingConfigMode,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type GoogleGenAI,
  type Part,
} from '@google/genai';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';

import type { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { ToolCallRecord } from '../../conversations/domain/message.entity.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { GEMINI_CLIENT, LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import {
  AgentRunner,
  type AgentRunInput,
  type AgentRunResult,
  type ConversationTurn,
} from '../domain/agent-runner.port.js';
import { AGENT_INSTRUCTIONS, AGENT_TOOLS, type AgentContext, type AgentTool } from '../domain/agent-tool.js';
import { AGENT_SYSTEM_PROMPT } from '../domain/system-prompt.js';

/** Replies are short voice-note scripts; this leaves ample room for thinking tokens. */
const MAX_OUTPUT_TOKENS = 8192;

/** Finish reasons meaning Gemini withheld the answer; the worker then gets the safe fallback. */
const BLOCKED: ReadonlySet<FinishReason | undefined> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

/** Accumulates what the tools did during one turn. */
class TurnLog {
  readonly toolCalls: ToolCallRecord[] = [];
  readonly citations = new Set<string>();
  readonly issueTypes = new Set<IssueType>();

  result(text: string | null): AgentRunResult {
    return { text, toolCalls: this.toolCalls, citations: [...this.citations], issueTypes: [...this.issueTypes] };
  }
}

/**
 * The agent loop on the Gemini API (manual function calling): the model reasons, calls
 * Haqdar's tools, sees their results and writes the Urdu reply. Conversation history lives
 * in Postgres, so each request is stateless.
 */
@Injectable()
export class GeminiAgentRunner implements AgentRunner {
  private readonly logger = new Logger(GeminiAgentRunner.name);
  private readonly toolsByName: Map<string, AgentTool>;
  private readonly declarations: FunctionDeclaration[];

  constructor(
    @Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI | null,
    private readonly settings: LlmSettings,
    @Inject(AGENT_TOOLS) tools: AgentTool[],
    /** The demo runs the same loop with its own instructions and a smaller tool set. */
    @Optional() @Inject(AGENT_INSTRUCTIONS) private readonly systemPrompt: string = AGENT_SYSTEM_PROMPT,
  ) {
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    // Sorted so the request prefix is identical every time and benefits from implicit caching.
    this.declarations = [...tools]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: toJsonSchema(tool.inputSchema),
      }));
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const client = this.client;
    if (!client || !this.settings.enabled) throw new LlmUnavailableError('The agent');

    const log = new TurnLog();
    const contents: Content[] = [...toContents(input.history), { role: 'user', parts: [{ text: input.message }] }];

    for (let round = 0; round < this.settings.maxToolRounds; round += 1) {
      const response = await this.generate(client, contents);
      const modelTurn = response.candidates?.[0]?.content;
      if (isBlocked(response) || !modelTurn) return log.result(null);

      const calls = functionCallsIn(modelTurn);
      if (calls.length === 0) return log.result(textOf(modelTurn));

      // The model turn goes back unchanged: it carries Gemini 3's thought signatures.
      contents.push(modelTurn);
      // Parallel calls are answered together, in one turn, matched by call id. Each one is
      // logged in the slot of its position, so the log keeps the model's order, not finish order.
      const first = log.toolCalls.length;
      const parts = await Promise.all(
        calls.map((call, index) => this.execute(call, input.context, log, first + index)),
      );
      contents.push({ role: 'user', parts });
    }

    // Out of tool rounds: ask for a final answer from what the tools have returned so far.
    this.logger.warn(`Agent hit ${this.settings.maxToolRounds} tool rounds; forcing a final answer`);
    const final = await this.generate(client, contents, FunctionCallingConfigMode.NONE);
    const finalTurn = final.candidates?.[0]?.content;
    return log.result(isBlocked(final) || !finalTurn ? null : textOf(finalTurn));
  }

  private generate(
    client: GoogleGenAI,
    contents: Content[],
    mode: FunctionCallingConfigMode = FunctionCallingConfigMode.AUTO,
  ): Promise<GenerateContentResponse> {
    return client.models.generateContent({
      model: this.settings.model,
      // A snapshot: the loop keeps appending to its own array after this request is sent.
      contents: [...contents],
      config: {
        systemInstruction: this.systemPrompt,
        tools: [{ functionDeclarations: this.declarations }],
        toolConfig: { functionCallingConfig: { mode } },
        // Gemini 3: depth is set by thinking level; temperature stays at its default.
        thinkingConfig: { thinkingLevel: this.settings.thinkingLevel },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
  }

  private async execute(call: FunctionCall, context: AgentContext, log: TurnLog, slot: number): Promise<Part> {
    const name = call.name ?? '';
    const respond = (response: Record<string, unknown>): Part => ({
      functionResponse: { id: call.id, name, response },
    });
    const fail = (error: string): Part => {
      log.toolCalls[slot] = { name, input: call.args ?? {}, ok: false };
      return respond({ error });
    };

    const tool = this.toolsByName.get(name);
    if (!tool) return fail(`Unknown tool "${name}".`);

    const parsed = tool.inputSchema.safeParse(call.args ?? {});
    if (!parsed.success) return fail(`Invalid input: ${z.prettifyError(parsed.error)}`);

    try {
      const output = await tool.execute(parsed.data, context);
      output.citations?.forEach((citation) => log.citations.add(citation));
      if (output.issueType) log.issueTypes.add(output.issueType);
      log.toolCalls[slot] = { name, input: parsed.data, ok: true };
      return respond({ output: output.result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unexpected error';
      this.logger.warn(`Tool ${name} failed: ${message}`);
      return fail(`The tool failed: ${message}`);
    }
  }
}

function isBlocked(response: GenerateContentResponse): boolean {
  return Boolean(response.promptFeedback?.blockReason) || BLOCKED.has(response.candidates?.[0]?.finishReason);
}

function functionCallsIn(content: Content): FunctionCall[] {
  return (content.parts ?? []).flatMap((part) => (part.functionCall ? [part.functionCall] : []));
}

/** The visible answer: text parts only, never the model's thought summaries. */
function textOf(content: Content): string | null {
  const text = (content.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
  return text || null;
}

/**
 * Stored history as Gemini turns: consecutive same-role turns are merged, it starts with
 * the user, and it ends with the model (the new user message follows).
 */
export function toContents(history: ConversationTurn[]): Content[] {
  const merged: ConversationTurn[] = [];
  for (const turn of history) {
    const last = merged.at(-1);
    if (last?.role === turn.role) last.text = `${last.text}\n\n${turn.text}`;
    else merged.push({ ...turn });
  }
  while (merged[0]?.role === 'assistant') merged.shift();
  if (merged.at(-1)?.role === 'user') merged.pop();

  return merged.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] }));
}
