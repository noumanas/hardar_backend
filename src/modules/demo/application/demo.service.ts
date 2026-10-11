import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { CalculatorsService } from '../../calculators/application/calculators.service.js';
import { KnowledgeService } from '../../knowledge/application/knowledge.service.js';
import { DEMO_SCENARIOS } from '../domain/demo-scenarios.js';
import {
  CaseStep,
  NEXT_SCENARIO,
  type AgentStage,
  type CardTone,
  type CardValue,
  type DemoScenario,
  type ScriptMessage,
} from '../domain/demo-script.js';

export type CaseStatus = 'in_progress' | 'complaint_filed' | 'resolved';

export interface DemoScenarioSummary {
  id: string;
  title: string;
  subtitle: string;
}

export interface DemoMessage {
  text: string;
  urdu: string | null;
  source: string | null;
  card: { label: string; value: string; tone: CardTone } | null;
  followUp: boolean;
}

export interface DemoChip {
  /** Send this back as `to` to take the step. */
  id: string;
  label: string;
  /** `next_scenario`: the case is over; the site moves on to the next example. */
  action: 'reply' | 'next_scenario';
}

/** One step of a demo case: what the agent says, the quick replies, and where the case stands. */
export interface DemoTurn {
  scenarioId: string;
  nodeId: string;
  messages: DemoMessage[];
  chips: DemoChip[];
  progress: { caseStep: CaseStep; agentStage: AgentStage; status: CaseStatus; resolved: boolean };
  /** The case the "next scenario" chip leads to. */
  nextScenarioId: string;
}

const formatAed = (amount: number): string =>
  `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Serves the website's public demo. Conversations are scripted (no LLM on a public
 * endpoint), but every money figure comes from the real calculators and every source from
 * the real knowledge-base search, so the demo shows exactly what the engine produces.
 * Stateless: the visitor's position travels with each request and nothing is stored.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly calculators: CalculatorsService,
    private readonly knowledge: KnowledgeService,
    private readonly scenarios: DemoScenario[] = DEMO_SCENARIOS,
  ) {}

  list(): DemoScenarioSummary[] {
    return this.scenarios.map(({ id, title, subtitle }) => ({ id, title, subtitle }));
  }

  start(scenarioId: string): Promise<DemoTurn> {
    const scenario = this.find(scenarioId);
    return this.render(scenario, scenario.start);
  }

  /** Takes the quick reply `to` from node `from`; only replies offered at that node are accepted. */
  step(scenarioId: string, from: string, to: string): Promise<DemoTurn> {
    const scenario = this.find(scenarioId);
    const node = scenario.nodes[from];
    if (!node) throw new BadRequestException(`Unknown step "${from}" in demo "${scenarioId}"`);
    if (to === NEXT_SCENARIO || !node.chips.some((chip) => chip.next === to)) {
      throw new BadRequestException(`"${to}" is not a reply offered at step "${from}"`);
    }
    return this.render(scenario, to);
  }

  private find(scenarioId: string): DemoScenario {
    const scenario = this.scenarios.find(({ id }) => id === scenarioId);
    if (!scenario) throw new NotFoundException(`Demo "${scenarioId}" not found`);
    return scenario;
  }

  private async render(scenario: DemoScenario, nodeId: string): Promise<DemoTurn> {
    const node = scenario.nodes[nodeId];
    const resolved = Boolean(node.resolved);

    return {
      scenarioId: scenario.id,
      nodeId,
      messages: await Promise.all(node.messages.map((message) => this.renderMessage(message))),
      chips: node.chips.map((chip) => ({
        id: chip.next,
        label: chip.label,
        action: chip.next === NEXT_SCENARIO ? 'next_scenario' : 'reply',
      })),
      progress: {
        caseStep: node.caseStep,
        agentStage: node.stage,
        resolved,
        status: resolved ? 'resolved' : node.caseStep === CaseStep.FollowUp ? 'complaint_filed' : 'in_progress',
      },
      nextScenarioId: this.nextAfter(scenario.id),
    };
  }

  private async renderMessage(message: ScriptMessage): Promise<DemoMessage> {
    return {
      text: message.text,
      urdu: message.urdu ?? null,
      source: message.source ? await this.lookUpSource(message.source.query, message.source.fallback) : null,
      card: message.card
        ? { label: message.card.label, value: this.cardValue(message.card.value), tone: message.card.tone }
        : null,
      followUp: Boolean(message.followUp),
    };
  }

  /** The rule the agent would cite: the knowledge base's best match for the question. */
  private async lookUpSource(query: string, fallback: string): Promise<string> {
    try {
      const [best] = await this.knowledge.search(query, 1);
      return best?.article.reference ?? fallback;
    } catch (error) {
      this.logger.warn(`Demo source lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  }

  private cardValue(value: CardValue): string {
    switch (value.kind) {
      case 'text':
        return value.text;
      case 'unpaid_salary': {
        const amount = formatAed(value.monthlySalary * value.months);
        return value.suffix ? `${amount} ${value.suffix}` : amount;
      }
      case 'overtime':
        return formatAed(this.calculators.overtime(value).totalOvertimePay);
    }
  }

  private nextAfter(scenarioId: string): string {
    const index = this.scenarios.findIndex(({ id }) => id === scenarioId);
    return this.scenarios[(index + 1) % this.scenarios.length].id;
  }
}
