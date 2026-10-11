import { FinishReason, FunctionCallingConfigMode, ThinkingLevel, type GoogleGenAI, type Part } from '@google/genai';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { testConfig } from '../../../../test/support/test-config.js';
import type { Env } from '../../../config/env.schema.js';
import { IssueType } from '../../complaints/domain/issue-type.enum.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import type { AgentTool } from '../domain/agent-tool.js';
import { AGENT_SYSTEM_PROMPT } from '../domain/system-prompt.js';
import { GeminiAgentRunner, toContents } from './gemini-agent-runner.js';

const modelTurn = (...parts: Part[]) => ({
  candidates: [{ content: { role: 'model', parts }, finishReason: FinishReason.STOP }],
});
const blocked = (finishReason: FinishReason) => ({ candidates: [{ finishReason }] });
const text = (value: string): Part => ({ text: value });
const call = (id: string, name: string, args: Record<string, unknown>): Part => ({ functionCall: { id, name, args } });

function lookupTool(
  execute: AgentTool['execute'] = async ({ query }: { query: string }) => ({
    result: { found: true, query },
    citations: ['Art. 13'],
    issueType: IssueType.PassportHeld,
  }),
): AgentTool {
  return {
    name: 'search_labour_law',
    description: 'Search the law',
    inputSchema: z.strictObject({ query: z.string().min(2) }),
    execute,
  };
}

const calculatorTool: AgentTool = {
  name: 'calculate_overtime',
  description: 'Overtime',
  inputSchema: z.strictObject({ hours: z.number() }),
  execute: async ({ hours }: { hours: number }) => ({ result: { pay: hours * 10 }, citations: ['Art. 19'] }),
};

function setup(tools: AgentTool[] = [lookupTool(), calculatorTool], env: Partial<Env> = {}) {
  const generateContent = vi.fn();
  const client = { models: { generateContent } } as unknown as GoogleGenAI;
  const runner = new GeminiAgentRunner(client, new LlmSettings(testConfig(env)), tools);
  return { generateContent, runner };
}

const input = {
  history: [],
  message: 'Can my company keep my passport?',
  context: { workerId: 'w', conversationId: 'c' },
};

/** The parts of the last user turn in the n-th request: the function responses sent back. */
const responsesIn = (generateContent: ReturnType<typeof vi.fn>, request: number) =>
  generateContent.mock.calls[request][0].contents.at(-1).parts.map((part: Part) => part.functionResponse);

describe('GeminiAgentRunner', () => {
  it('sends its own instructions when given a system prompt (the website demo)', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: FinishReason.STOP }],
    });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const runner = new GeminiAgentRunner(client, new LlmSettings(testConfig()), [], 'Demo instructions');

    await runner.run(input);

    expect(generateContent.mock.calls[0][0].config.systemInstruction).toBe('Demo instructions');
  });

  beforeEach(() => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('returns the model text, without its thought summaries', async () => {
    const { generateContent, runner } = setup();
    generateContent.mockResolvedValueOnce(
      modelTurn({ text: 'thinking about passports', thought: true }, text('سلام '), text('میں حقدار ہوں')),
    );

    await expect(runner.run(input)).resolves.toEqual({
      text: 'سلام میں حقدار ہوں',
      toolCalls: [],
      citations: [],
      issueTypes: [],
    });
  });

  it('sends the model, system prompt, sorted tool schemas and thinking level, and no temperature', async () => {
    const { generateContent, runner } = setup(undefined, { AGENT_THINKING_LEVEL: 'medium' });
    generateContent.mockResolvedValueOnce(modelTurn(text('ok')));

    await runner.run(input);

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash');
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: input.message }] }]);
    expect(request.config).toMatchObject({
      systemInstruction: AGENT_SYSTEM_PROMPT,
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    });
    expect(request.config.temperature).toBeUndefined();

    const declarations = request.config.tools[0].functionDeclarations;
    expect(declarations.map((declaration: { name: string }) => declaration.name)).toEqual([
      'calculate_overtime',
      'search_labour_law',
    ]);
    expect(declarations[1].parametersJsonSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'string', minLength: 2 } },
      required: ['query'],
      additionalProperties: false,
    });
  });

  it('runs a tool and sends its result back with the call id and name, keeping the model turn intact', async () => {
    const execute = vi.fn(async () => ({
      result: { found: true },
      citations: ['Art. 13'],
      issueType: IssueType.PassportHeld,
    }));
    const { generateContent, runner } = setup([lookupTool(execute)]);
    const toolTurn = modelTurn({
      ...call('c1', 'search_labour_law', { query: 'passport' }),
      thoughtSignature: 'sig-1',
    });
    generateContent
      .mockResolvedValueOnce(toolTurn)
      .mockResolvedValueOnce(modelTurn(text('نہیں، کمپنی پاسپورٹ نہیں رکھ سکتی۔')));

    const result = await runner.run(input);

    expect(execute).toHaveBeenCalledWith({ query: 'passport' }, input.context);
    expect(result).toEqual({
      text: 'نہیں، کمپنی پاسپورٹ نہیں رکھ سکتی۔',
      toolCalls: [{ name: 'search_labour_law', input: { query: 'passport' }, ok: true }],
      citations: ['Art. 13'],
      issueTypes: [IssueType.PassportHeld],
    });

    const followUp = generateContent.mock.calls[1][0].contents;
    expect(followUp.at(-2)).toBe(toolTurn.candidates[0].content); // thought signature preserved
    expect(followUp.at(-1)).toEqual({
      role: 'user',
      parts: [{ functionResponse: { id: 'c1', name: 'search_labour_law', response: { output: { found: true } } } }],
    });
  });

  it('answers parallel calls together, in one turn', async () => {
    const { generateContent, runner } = setup();
    generateContent
      .mockResolvedValueOnce(
        modelTurn(call('a', 'search_labour_law', { query: 'overtime' }), call('b', 'calculate_overtime', { hours: 3 })),
      )
      .mockResolvedValueOnce(modelTurn(text('done')));

    const result = await runner.run(input);

    expect(responsesIn(generateContent, 1).map((response: { id: string }) => response.id)).toEqual(['a', 'b']);
    expect(result.citations).toEqual(['Art. 13', 'Art. 19']);
  });

  it.each([
    ['an unknown tool', call('x', 'delete_everything', {}), 'Unknown tool "delete_everything".'],
    ['invalid tool input', call('x', 'search_labour_law', { query: 'a' }), 'Invalid input'],
    ['a call without a name', { functionCall: { id: 'x' } }, 'Unknown tool "".'],
  ])('returns an error response for %s so the model can recover', async (_case, part, message) => {
    const { generateContent, runner } = setup();
    generateContent.mockResolvedValueOnce(modelTurn(part)).mockResolvedValueOnce(modelTurn(text('sorry')));

    const result = await runner.run(input);

    const [response] = responsesIn(generateContent, 1);
    expect(response.id).toBe('x');
    expect(response.response.error).toContain(message);
    expect(result.toolCalls).toEqual([expect.objectContaining({ ok: false })]);
  });

  it.each([
    ['an Error', new Error('database down'), 'The tool failed: database down'],
    ['anything else', 'boom', 'The tool failed: unexpected error'],
  ])('turns a tool that throws %s into an error response', async (_case, thrown, message) => {
    const { generateContent, runner } = setup([lookupTool(vi.fn().mockRejectedValue(thrown))]);
    generateContent
      .mockResolvedValueOnce(modelTurn(call('x', 'search_labour_law', { query: 'salary' })))
      .mockResolvedValueOnce(modelTurn(text('MOHRE 600590000')));

    await runner.run(input);

    expect(responsesIn(generateContent, 1)[0].response).toEqual({ error: message });
  });

  it.each([FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.RECITATION])(
    'returns no text when Gemini withholds the answer (%s)',
    async (reason) => {
      const { generateContent, runner } = setup();
      generateContent.mockResolvedValueOnce(blocked(reason));

      await expect(runner.run(input)).resolves.toMatchObject({ text: null });
    },
  );

  it('returns no text when the prompt itself is blocked', async () => {
    const { generateContent, runner } = setup();
    generateContent.mockResolvedValueOnce({ promptFeedback: { blockReason: 'SAFETY' } });

    await expect(runner.run(input)).resolves.toMatchObject({ text: null });
  });

  it('returns no text for an empty answer', async () => {
    const { generateContent, runner } = setup();
    generateContent.mockResolvedValueOnce(modelTurn(text('   ')));

    await expect(runner.run(input)).resolves.toMatchObject({ text: null });
  });

  it('forces a final answer without tools once the round limit is reached', async () => {
    const { generateContent, runner } = setup(undefined, { AGENT_MAX_TOOL_ROUNDS: 2 });
    generateContent
      .mockResolvedValueOnce(modelTurn(call('1', 'calculate_overtime', { hours: 1 })))
      .mockResolvedValueOnce(modelTurn(call('2', 'calculate_overtime', { hours: 2 })))
      .mockResolvedValueOnce(modelTurn(text('final')));

    await expect(runner.run(input)).resolves.toMatchObject({ text: 'final' });
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent.mock.calls[2][0].config.toolConfig).toEqual({
      functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
    });
  });

  it('returns no text if the forced final answer is blocked', async () => {
    const { generateContent, runner } = setup(undefined, { AGENT_MAX_TOOL_ROUNDS: 1 });
    generateContent
      .mockResolvedValueOnce(modelTurn(call('1', 'calculate_overtime', { hours: 1 })))
      .mockResolvedValueOnce(blocked(FinishReason.SAFETY));

    await expect(runner.run(input)).resolves.toMatchObject({ text: null });
  });

  it.each([
    ['the provider is off', { AGENT_LLM_PROVIDER: 'none' as const }],
    ['there is no API key', { GEMINI_API_KEY: undefined }],
  ])('refuses to run when %s', async (_case, env) => {
    const { runner } = setup(undefined, env);
    await expect(runner.run(input)).rejects.toThrow(LlmUnavailableError);
  });

  it('refuses to run without a client', async () => {
    const runner = new GeminiAgentRunner(null, new LlmSettings(testConfig()), []);
    await expect(runner.run(input)).rejects.toThrow(LlmUnavailableError);
  });
});

describe('toContents', () => {
  it('maps roles to Gemini, merges consecutive turns, starts with the user and ends with the model', () => {
    expect(
      toContents([
        { role: 'assistant', text: 'greeting' },
        { role: 'user', text: 'q1' },
        { role: 'user', text: 'q1 again' },
        { role: 'assistant', text: 'a1' },
        { role: 'user', text: 'unanswered' },
      ]),
    ).toEqual([
      { role: 'user', parts: [{ text: 'q1\n\nq1 again' }] },
      { role: 'model', parts: [{ text: 'a1' }] },
    ]);
  });

  it('returns an empty history unchanged', () => {
    expect(toContents([])).toEqual([]);
  });
});
