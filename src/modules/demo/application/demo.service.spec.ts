import { BadRequestException, NotFoundException } from '@nestjs/common';

import { aLawArticle } from '../../../../test/support/builders.js';
import { CalculatorsService } from '../../calculators/application/calculators.service.js';
import type { KnowledgeService } from '../../knowledge/application/knowledge.service.js';
import { DEMO_SCENARIOS } from '../domain/demo-scenarios.js';
import { AgentStage, CaseStep, NEXT_SCENARIO, type DemoScenario } from '../domain/demo-script.js';
import { DemoService } from './demo.service.js';

function setup(scenarios: DemoScenario[] = DEMO_SCENARIOS) {
  const knowledge = { search: vi.fn().mockResolvedValue([]) };
  const service = new DemoService(new CalculatorsService(), knowledge as unknown as KnowledgeService, scenarios);
  return { knowledge, service };
}

describe('DemoService', () => {
  it('lists the cases without their scripts', () => {
    expect(setup().service.list()).toEqual([
      { id: 'late-salary', title: 'Late salary', subtitle: '2 months unpaid' },
      { id: 'passport-kept', title: 'Passport kept', subtitle: 'Employer is holding it' },
      { id: 'unpaid-overtime', title: 'Unpaid overtime', subtitle: '10 hours a day' },
    ]);
  });

  it('starts a case with the greeting and the first reply', async () => {
    const turn = await setup().service.start('late-salary');

    expect(turn).toMatchObject({
      scenarioId: 'late-salary',
      nodeId: 's1',
      chips: [{ id: 's2', label: 'My salary is 2 months late', action: 'reply' }],
      progress: {
        caseStep: CaseStep.ProblemShared,
        agentStage: AgentStage.Understanding,
        status: 'in_progress',
        resolved: false,
      },
      nextScenarioId: 'passport-kept',
    });
    expect(turn.messages[0]).toMatchObject({ source: null, card: null, followUp: false });
    expect(turn.messages[0].urdu).toBeTruthy();
  });

  it('rejects an unknown case', async () => {
    const { service } = setup();
    expect(() => service.start('nope')).toThrow(NotFoundException);
    expect(() => service.step('nope', 's1', 's2')).toThrow(NotFoundException);
  });

  it.each([
    ['an unknown step', 'zz', 's2'],
    ['a reply not offered at that step', 's1', 's9'],
    ['the next-scenario marker', 's9', NEXT_SCENARIO],
  ])('rejects %s', (_, from, to) => {
    expect(() => setup().service.step('late-salary', from, to)).toThrow(BadRequestException);
  });

  it('cites the best knowledge-base match as the source', async () => {
    const { knowledge, service } = setup();
    knowledge.search.mockResolvedValue([
      { article: aLawArticle({ reference: 'Decree-Law 33/2021, Art. 22' }), rank: 1 },
    ]);

    const turn = await service.step('late-salary', 's2', 's3');

    expect(knowledge.search).toHaveBeenCalledWith('salary paid on time WPS', 1);
    expect(turn.messages[0].source).toBe('Decree-Law 33/2021, Art. 22');
    expect(turn.messages[1].card).toEqual({ label: 'Owed for 2 months', value: 'AED 3,000', tone: 'lime' });
  });

  it('falls back to the scripted source when nothing matches or the search fails', async () => {
    const { knowledge, service } = setup();
    expect((await service.step('late-salary', 's2', 's3')).messages[0].source).toBe('UAE Labour Law · WPS');

    knowledge.search.mockRejectedValue(new Error('db down'));
    expect((await service.step('late-salary', 's2', 's3')).messages[0].source).toBe('UAE Labour Law · WPS');

    knowledge.search.mockRejectedValue('db down');
    expect((await service.step('late-salary', 's2', 's3')).messages[0].source).toBe('UAE Labour Law · WPS');
  });

  it('works out overtime with the real calculator', async () => {
    const turn = await setup().service.step('unpaid-overtime', 'o2', 'o3');
    expect(turn.messages[0].card).toEqual({ label: 'Overtime owed this month', value: 'AED 156.25', tone: 'lilac' });
  });

  it('shows text cards and amounts with a suffix as written', async () => {
    const { service } = setup();
    expect((await service.step('passport-kept', 'p2', 'p2u')).messages[0].card?.value).toBe('600590000');
    expect((await service.step('late-salary', 's7', 's9')).messages[0].card?.value).toBe('AED 3,000 paid');
  });

  it('marks a filed complaint, a follow-up and a resolved case', async () => {
    const { service } = setup();

    const followUp = await service.step('late-salary', 's6', 's7');
    expect(followUp.progress.status).toBe('complaint_filed');
    expect(followUp.messages[0].followUp).toBe(true);

    const resolved = await service.step('late-salary', 's7', 's9');
    expect(resolved.progress).toMatchObject({ status: 'resolved', resolved: true, caseStep: CaseStep.Resolved });
    expect(resolved.chips).toEqual([{ id: NEXT_SCENARIO, label: 'Try another problem', action: 'next_scenario' }]);
  });

  it('cycles back to the first case after the last', async () => {
    expect((await setup().service.start('unpaid-overtime')).nextScenarioId).toBe('late-salary');
  });
});
