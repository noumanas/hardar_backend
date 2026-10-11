import { CaseStatus, ComplaintCase } from '../../src/modules/complaints/domain/complaint-case.entity.js';
import { IssueType } from '../../src/modules/complaints/domain/issue-type.enum.js';
import { ContractSummary } from '../../src/modules/contracts/domain/contract-summary.entity.js';
import type { ContractTerms } from '../../src/modules/contracts/domain/contract-terms.js';
import { Conversation } from '../../src/modules/conversations/domain/conversation.entity.js';
import { Message, MessageDirection, MessageKind } from '../../src/modules/conversations/domain/message.entity.js';
import { LawArticle, LawTopic } from '../../src/modules/knowledge/domain/law-article.entity.js';
import { ConsentStatus, Worker } from '../../src/modules/workers/domain/worker.entity.js';

/** Small factories for domain objects in unit tests. Each accepts overrides. */

const at = new Date('2026-10-01T10:00:00Z');

export const aWorker = (overrides: Partial<Worker> = {}): Worker =>
  Object.assign(new Worker(), {
    id: 'worker-1',
    phoneHash: 'hash',
    phoneEncrypted: 'encrypted',
    language: 'ur',
    consentStatus: ConsentStatus.Granted,
    consentAt: at,
    lastActiveAt: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  Object.assign(new Conversation(), {
    id: 'conversation-1',
    workerId: 'worker-1',
    issueType: null,
    lastMessageAt: at,
    reviewedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aMessage = (overrides: Partial<Message> = {}): Message =>
  Object.assign(new Message(), {
    id: 'message-1',
    conversationId: 'conversation-1',
    direction: MessageDirection.Inbound,
    kind: MessageKind.Text,
    body: 'hello',
    externalId: null,
    toolCalls: [],
    citations: [],
    urgent: false,
    flagged: false,
    flagReason: null,
    latencyMs: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const contractTerms = (overrides: Partial<ContractTerms> = {}): ContractTerms => ({
  jobTitle: 'Mason',
  basicMonthlySalary: 1500,
  monthlyAllowances: 300,
  currency: 'AED',
  workingHoursPerDay: 8,
  workingDaysPerWeek: 6,
  annualLeaveDays: 30,
  probationMonths: 6,
  noticePeriodDays: 30,
  startDate: '2025-01-01',
  endDate: '2027-01-01',
  ...overrides,
});

export const aContractSummary = (overrides: Partial<ContractSummary> = {}): ContractSummary =>
  Object.assign(new ContractSummary(), {
    id: 'summary-1',
    workerId: 'worker-1',
    terms: contractTerms(),
    flags: [],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aComplaintCase = (overrides: Partial<ComplaintCase> = {}): ComplaintCase =>
  Object.assign(new ComplaintCase(), {
    id: 'case-1',
    workerId: 'worker-1',
    issueType: IssueType.UnpaidSalary,
    status: CaseStatus.Open,
    followUpAt: at,
    followUpSentAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aLawArticle = (overrides: Partial<LawArticle> = {}): LawArticle =>
  Object.assign(new LawArticle(), {
    id: 'article-1',
    reference: 'Decree-Law 33/2021, Art. 13',
    title: 'Employer may not keep the passport',
    body: 'An employer may not keep a worker’s passport.',
    topic: LawTopic.Passport,
    sourceUrl: null,
    verified: false,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });
