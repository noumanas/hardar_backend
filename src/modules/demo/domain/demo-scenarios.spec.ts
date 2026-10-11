import { DEMO_SCENARIOS } from './demo-scenarios.js';
import { CASE_STEPS, NEXT_SCENARIO } from './demo-script.js';

describe('DEMO_SCENARIOS', () => {
  it('has unique ids', () => {
    const ids = DEMO_SCENARIOS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(DEMO_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))('%s', (_, scenario) => {
    const nodes = Object.entries(scenario.nodes);

    it('starts at an existing step', () => {
      expect(scenario.nodes[scenario.start]).toBeDefined();
    });

    it('only links to existing steps, and every step offers a reply', () => {
      for (const [, node] of nodes) {
        expect(node.chips.length).toBeGreaterThan(0);
        for (const chip of node.chips) {
          expect(chip.next === NEXT_SCENARIO || chip.next in scenario.nodes).toBe(true);
        }
      }
    });

    it('reaches every step from the start, and ends resolved', () => {
      const seen = new Set<string>();
      const queue = [scenario.start];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(...scenario.nodes[id].chips.map((chip) => chip.next).filter((next) => next !== NEXT_SCENARIO));
      }
      expect([...seen].sort()).toEqual(Object.keys(scenario.nodes).sort());

      const endings = nodes.filter(([, node]) => node.chips.some((chip) => chip.next === NEXT_SCENARIO));
      expect(endings.length).toBeGreaterThan(0);
      for (const [, node] of endings) expect(node.resolved).toBe(true);
    });

    it('never moves the case backwards', () => {
      for (const [, node] of nodes) {
        for (const chip of node.chips) {
          if (chip.next === NEXT_SCENARIO) continue;
          const next = scenario.nodes[chip.next];
          expect(CASE_STEPS.indexOf(next.caseStep)).toBeGreaterThanOrEqual(CASE_STEPS.indexOf(node.caseStep));
        }
      }
    });
  });
});
