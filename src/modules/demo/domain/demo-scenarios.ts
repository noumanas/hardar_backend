import { AgentStage, CaseStep, NEXT_SCENARIO, type DemoScenario, type ScriptMessage } from './demo-script.js';

const GREETING: ScriptMessage = {
  text: 'Assalam o Alaikum! I am Haqdar. Tell me your problem by voice or text. This is a demo with an example case.',
  urdu: 'السلام علیکم! میں حقدار ہوں۔ اپنا مسئلہ بتائیں۔',
};

const BASIC_SALARY = 1500;

/** The three example cases on the website, in the order "Try another problem" cycles through. */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'late-salary',
    title: 'Late salary',
    subtitle: '2 months unpaid',
    start: 's1',
    nodes: {
      s1: {
        stage: AgentStage.Understanding,
        caseStep: CaseStep.ProblemShared,
        messages: [GREETING],
        chips: [{ label: 'My salary is 2 months late', next: 's2' }],
      },
      s2: {
        stage: AgentStage.Planning,
        caseStep: CaseStep.RightsExplained,
        messages: [
          {
            text: 'I understand: your salary has not been paid for 2 months. What is the basic salary in your contract?',
          },
        ],
        chips: [{ label: 'AED 1,500 a month', next: 's3' }],
      },
      s3: {
        stage: AgentStage.Checking,
        caseStep: CaseStep.RightsExplained,
        messages: [
          {
            text: 'Your company must pay your salary on time through the bank (the Wage Protection System). Not paying for 2 months breaks this rule.',
            source: { query: 'salary paid on time WPS', fallback: 'UAE Labour Law · WPS' },
          },
          {
            text: 'Here is what you are owed in basic salary:',
            card: {
              label: 'Owed for 2 months',
              value: { kind: 'unpaid_salary', monthlySalary: BASIC_SALARY, months: 2 },
              tone: 'lime',
            },
          },
        ],
        chips: [{ label: 'What should I do?', next: 's4' }],
      },
      s4: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.ComplaintGuided,
        messages: [
          {
            text: 'You can file a free complaint with MOHRE, the labour ministry. First get these ready: your contract, Emirates ID or work permit, and a bank statement showing no salary.',
          },
        ],
        chips: [{ label: 'I have them. Guide me', next: 's5' }],
      },
      s5: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.ComplaintGuided,
        messages: [
          {
            text: 'Open the MOHRE app or call 600590000, and choose the option to file a labour complaint about unpaid salary. I can read each screen to you in Urdu. Tell me when you get a complaint number.',
          },
        ],
        chips: [{ label: 'I got my complaint number', next: 's6' }],
      },
      s6: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.FollowUp,
        messages: [
          { text: 'Saved. Your complaint is filed. MOHRE will contact your company. I will check on you in 7 days.' },
        ],
        chips: [{ label: 'Skip to 7 days later', next: 's7' }],
      },
      s7: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.FollowUp,
        messages: [{ text: '7 days later. Hello again! Did your company pay your salary?', followUp: true }],
        chips: [
          { label: 'They paid 1 month only', next: 's8' },
          { label: 'Yes, paid in full', next: 's9' },
        ],
      },
      s8: {
        stage: AgentStage.Checking,
        caseStep: CaseStep.FollowUp,
        messages: [
          {
            text: 'You are still owed one month.',
            card: {
              label: 'Still missing',
              value: { kind: 'unpaid_salary', monthlySalary: BASIC_SALARY, months: 1 },
              tone: 'peach',
            },
          },
          {
            text: 'Tell MOHRE using your complaint number that only one month was paid. They will continue your case. I will check again in 7 days.',
          },
        ],
        chips: [{ label: 'Skip ahead: paid in full', next: 's9' }],
      },
      s9: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.Resolved,
        resolved: true,
        messages: [
          {
            text: 'Wonderful news! Your full salary has been paid. Your case is resolved.',
            card: {
              label: 'Case resolved',
              value: { kind: 'unpaid_salary', monthlySalary: BASIC_SALARY, months: 2, suffix: 'paid' },
              tone: 'lime',
            },
          },
          { text: 'If it happens again, just message me. Haqdar is free, any time.', urdu: 'آپ کا حق آپ کو مل گیا۔' },
        ],
        chips: [{ label: 'Try another problem', next: NEXT_SCENARIO }],
      },
    },
  },
  {
    id: 'passport-kept',
    title: 'Passport kept',
    subtitle: 'Employer is holding it',
    start: 'p1',
    nodes: {
      p1: {
        stage: AgentStage.Understanding,
        caseStep: CaseStep.ProblemShared,
        messages: [GREETING],
        chips: [{ label: 'My company kept my passport', next: 'p2' }],
      },
      p2: {
        stage: AgentStage.Checking,
        caseStep: CaseStep.RightsExplained,
        messages: [
          {
            text: 'This is important. An employer is not allowed to keep your passport. Are you safe right now?',
            source: { query: 'employer keep passport', fallback: 'UAE Labour Law · employer duties' },
          },
        ],
        chips: [
          { label: 'Yes, I am safe', next: 'p3' },
          { label: 'No, I need help now', next: 'p2u' },
        ],
      },
      p2u: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.ComplaintGuided,
        messages: [
          {
            text: 'Please call MOHRE on 600590000 now. If you are in danger, call 999 for the police. I will stay here with you.',
            card: { label: 'Call now', value: { kind: 'text', text: '600590000' }, tone: 'peach' },
          },
        ],
        chips: [{ label: 'I called. What next?', next: 'p3' }],
      },
      p3: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.ComplaintGuided,
        messages: [
          {
            text: 'Ask your employer politely, in writing, to return your passport. If they refuse, file a complaint with MOHRE. Keep a photo of your passport and visa page.',
          },
        ],
        chips: [{ label: 'They refused. Guide me', next: 'p4' }],
      },
      p4: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.FollowUp,
        messages: [
          {
            text: 'Open the MOHRE app or call 600590000 and file a complaint that your passport is being held. Tell me when you get a complaint number.',
          },
        ],
        chips: [{ label: 'I filed it', next: 'p5' }],
      },
      p5: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.FollowUp,
        messages: [{ text: 'Well done. I will check on you in 5 days.' }],
        chips: [{ label: 'Skip to 5 days later', next: 'p6' }],
      },
      p6: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.FollowUp,
        messages: [{ text: '5 days later. Did you get your passport back?', followUp: true }],
        chips: [{ label: 'Yes, I have it now', next: 'p7' }],
      },
      p7: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.Resolved,
        resolved: true,
        messages: [
          {
            text: 'Great! Your passport is back with you. Your case is resolved. Keep it in a safe place.',
            card: { label: 'Case resolved', value: { kind: 'text', text: 'Passport returned' }, tone: 'lime' },
          },
        ],
        chips: [{ label: 'Try another problem', next: NEXT_SCENARIO }],
      },
    },
  },
  {
    id: 'unpaid-overtime',
    title: 'Unpaid overtime',
    subtitle: '10 hours a day',
    start: 'o1',
    nodes: {
      o1: {
        stage: AgentStage.Understanding,
        caseStep: CaseStep.ProblemShared,
        messages: [GREETING],
        chips: [{ label: 'I work 10 hours but get no overtime', next: 'o2' }],
      },
      o2: {
        stage: AgentStage.Planning,
        caseStep: CaseStep.RightsExplained,
        messages: [
          {
            text: 'The normal limit is 8 hours a day. Extra hours should be paid at least 25% more. What is your basic salary?',
            source: { query: 'maximum working hours overtime', fallback: 'UAE Labour Law · working hours' },
          },
        ],
        chips: [{ label: 'AED 1,500, about 20 extra hours a month', next: 'o3' }],
      },
      o3: {
        stage: AgentStage.Checking,
        caseStep: CaseStep.RightsExplained,
        messages: [
          {
            text: 'I calculated this with code, not a guess:',
            card: {
              label: 'Overtime owed this month',
              value: {
                kind: 'overtime',
                basicMonthlySalary: BASIC_SALARY,
                normalOvertimeHours: 20,
                nightOvertimeHours: 0,
              },
              tone: 'lilac',
            },
          },
        ],
        chips: [{ label: 'How do I get it?', next: 'o4' }],
      },
      o4: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.ComplaintGuided,
        messages: [
          {
            text: 'First ask your supervisor or HR in writing, showing your hours. If they say no, file a free complaint with MOHRE. Keep a record of your daily hours.',
          },
        ],
        chips: [{ label: 'They said no. Guide me', next: 'o5' }],
      },
      o5: {
        stage: AgentStage.UsingTools,
        caseStep: CaseStep.FollowUp,
        messages: [
          {
            text: 'Open the MOHRE app or call 600590000 and file a complaint about unpaid overtime. Tell me when you get a complaint number.',
          },
        ],
        chips: [{ label: 'I filed it', next: 'o6' }],
      },
      o6: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.FollowUp,
        messages: [{ text: '7 days later. Was your overtime paid?', followUp: true }],
        chips: [{ label: 'Yes, it was added to my salary', next: 'o7' }],
      },
      o7: {
        stage: AgentStage.FollowingUp,
        caseStep: CaseStep.Resolved,
        resolved: true,
        messages: [
          {
            text: 'Excellent! Your overtime has been paid. Your case is resolved.',
            card: { label: 'Case resolved', value: { kind: 'text', text: 'Overtime paid' }, tone: 'lime' },
          },
        ],
        chips: [{ label: 'Try another problem', next: NEXT_SCENARIO }],
      },
    },
  },
];
