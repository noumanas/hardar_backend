/**
 * The public website's "Try the demo": scripted example cases a visitor steps through.
 * Scripts are plain data. Money cards and law sources are not written here as text; they
 * name what to compute or look up, and the demo service fills them from the real engine.
 */

/** Where the worker's case stands, as shown in "Case progress". */
export enum CaseStep {
  ProblemShared = 'problem_shared',
  RightsExplained = 'rights_explained',
  ComplaintGuided = 'complaint_guided',
  FollowUp = 'follow_up',
  Resolved = 'resolved',
}

export const CASE_STEPS = Object.values(CaseStep);

/** What the agent is doing at this point, as shown in "Agent is now". */
export enum AgentStage {
  Understanding = 'understanding',
  Planning = 'planning',
  UsingTools = 'using_tools',
  Checking = 'checking',
  FollowingUp = 'following_up',
}

export type CardTone = 'lime' | 'peach' | 'lilac';

/** A card's figure: fixed text, or a value the real calculators work out. */
export type CardValue =
  | { kind: 'text'; text: string }
  | { kind: 'unpaid_salary'; monthlySalary: number; months: number; suffix?: string }
  | { kind: 'overtime'; basicMonthlySalary: number; normalOvertimeHours: number; nightOvertimeHours: number };

export interface ScriptMessage {
  text: string;
  /** A line in Urdu script under the English text. */
  urdu?: string;
  /** Looked up in the knowledge base; `fallback` is shown if nothing matches. */
  source?: { query: string; fallback: string };
  card?: { label: string; value: CardValue; tone: CardTone };
  /** Sent days later by the follow-up scheduler, not as an immediate reply. */
  followUp?: boolean;
}

/** A quick reply: the visitor's words, and the node it leads to (or the next case). */
export interface ScriptChip {
  label: string;
  next: string;
}

export const NEXT_SCENARIO = 'next_scenario';

export interface ScriptNode {
  stage: AgentStage;
  caseStep: CaseStep;
  messages: ScriptMessage[];
  chips: ScriptChip[];
  resolved?: boolean;
}

export interface DemoScenario {
  id: string;
  title: string;
  subtitle: string;
  start: string;
  nodes: Record<string, ScriptNode>;
}
