import type { DataSource } from 'typeorm';

import { LawArticle, LawTopic } from '../../modules/knowledge/domain/law-article.entity.js';
import type { LawArticleData } from '../../modules/knowledge/domain/law-article.repository.js';

const LAW = 'Decree-Law 33/2021';
const MOHRE = 'https://www.mohre.gov.ae';

/**
 * Starter knowledge base from the PRD's "Core rules to encode". The PRD marks these as
 * approximate: every article is seeded unverified, and article numbers must be checked
 * against current MOHRE material before an admin marks it verified.
 */
export const LAW_ARTICLE_SEED: LawArticleData[] = [
  {
    reference: `${LAW}, Art. 8`,
    topic: LawTopic.Contract,
    title: 'Employment contract and offer letter',
    body:
      'Employment contracts are fixed-term and must be registered with MOHRE. The offer letter the worker signs ' +
      'before arriving must match the contract: the job, salary and main terms may not be changed to the worker’s disadvantage.',
  },
  {
    reference: `${LAW}, Art. 9`,
    topic: LawTopic.Probation,
    title: 'Probation period',
    body: 'A probation period may not be longer than 6 months. The employer must give written notice before ending employment during probation.',
  },
  {
    reference: `${LAW}, Art. 17`,
    topic: LawTopic.WorkingHours,
    title: 'Maximum working hours',
    body: 'Normal working hours are at most 8 hours a day and 48 hours a week. Hours worked beyond this are overtime.',
  },
  {
    reference: `${LAW}, Art. 19`,
    topic: LawTopic.Overtime,
    title: 'Overtime pay',
    body:
      'Overtime is paid at the basic hourly wage plus at least 25%. Overtime worked between 10pm and 4am is paid at ' +
      'the basic hourly wage plus at least 50%. Overtime should not exceed 2 hours a day.',
  },
  {
    reference: `${LAW}, Art. 29`,
    topic: LawTopic.Leave,
    title: 'Annual leave',
    body:
      'After one year of service a worker is entitled to 30 days of paid annual leave each year. After six months ' +
      'of service a worker is entitled to 2 days of leave for each month worked.',
  },
  {
    reference: `${LAW}, Art. 22; Wage Protection System`,
    topic: LawTopic.Salary,
    title: 'Salary paid on time through WPS',
    body:
      'Wages must be paid on their due date through the Wage Protection System (WPS), the bank system MOHRE uses to ' +
      'track salary payments. Late or missing salary payments are recorded by WPS and can be reported to MOHRE.',
  },
  {
    reference: `${LAW}, Art. 13`,
    topic: LawTopic.Passport,
    title: 'Employer may not keep the passport',
    body: 'An employer may not keep a worker’s passport or other official identity documents.',
  },
  {
    reference: `${LAW}, Art. 6`,
    topic: LawTopic.RecruitmentFees,
    title: 'Recruitment fees are paid by the employer',
    body: 'Recruitment fees and costs are paid by the employer. The employer or agency may not charge the worker for them.',
  },
  {
    reference: `${LAW}, Art. 43`,
    topic: LawTopic.Termination,
    title: 'Notice period',
    body: 'Either party may end an employment contract by giving written notice of at least 30 days and at most 90 days.',
  },
  {
    reference: `${LAW}, Art. 51`,
    topic: LawTopic.Gratuity,
    title: 'End-of-service gratuity',
    body:
      'A worker who completes at least one year of service is owed end-of-service gratuity on their basic salary: ' +
      '21 days of basic salary for each of the first 5 years and 30 days for each year after. Part years count ' +
      'pro rata. The total may not exceed two years of basic salary.',
  },
  {
    reference: 'MOHRE midday work break resolution',
    topic: LawTopic.Safety,
    title: 'Summer midday break',
    body:
      'From mid-June to mid-September, outdoor work under direct sun is not allowed around midday (roughly 12:30pm ' +
      'to 3pm). Employers must provide shade and drinking water.',
  },
  {
    reference: 'MOHRE complaint services',
    topic: LawTopic.Complaints,
    title: 'How to file a labour complaint',
    body:
      'Workers can file a labour complaint free of charge through the MOHRE app, by calling the MOHRE call centre ' +
      'on 600590000, or at Tas-heel and Tawafuq service centres. Keep the complaint number to follow up.',
  },
  {
    reference: 'Involuntary Loss of Employment (ILOE) scheme',
    topic: LawTopic.Other,
    title: 'Unemployment insurance',
    body:
      'Most private-sector workers must subscribe to the unemployment insurance scheme, which pays part of the ' +
      'salary for a limited time after losing a job through no fault of their own.',
  },
].map((article) => ({ ...article, sourceUrl: MOHRE, verified: false }));

/** Inserts seed articles that aren't there yet (matched by reference); safe to run repeatedly. */
export async function seedLawArticles(dataSource: DataSource): Promise<number> {
  const repository = dataSource.getRepository(LawArticle);
  let inserted = 0;
  for (const article of LAW_ARTICLE_SEED) {
    if (await repository.existsBy({ reference: article.reference })) continue;
    await repository.save(repository.create(article));
    inserted += 1;
  }
  return inserted;
}
