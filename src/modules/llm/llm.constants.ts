/** The Gemini client, or `null` when no LLM is configured (the agent then sends its safe fallback reply). */
export const GEMINI_CLIENT = Symbol('GEMINI_CLIENT');

/** Raised when an LLM-backed feature is called but no provider is configured. */
export class LlmUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} needs an LLM: set AGENT_LLM_PROVIDER=gemini and GEMINI_API_KEY`);
    this.name = LlmUnavailableError.name;
  }
}
