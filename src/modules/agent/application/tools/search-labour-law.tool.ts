import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { KnowledgeService } from '../../../knowledge/application/knowledge.service.js';
import type { AgentTool, ToolOutput } from '../../domain/agent-tool.js';

/** Long articles (definitions, penalties) are cut so four results stay a reasonable prompt. */
export const ARTICLE_TEXT_LIMIT = 3000;

const inputSchema = z.strictObject({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe(
      'The legal question as short English keywords in the words the law uses, e.g. "overtime basic wage night" ' +
        'or "withhold official documents" for a kept passport',
    ),
});

/** FR-7: retrieval over the official knowledge base; the only source the agent may answer from. */
@Injectable()
export class SearchLabourLawTool implements AgentTool<typeof inputSchema> {
  readonly name = 'search_labour_law';
  readonly description =
    'Search the official UAE worker-law texts: the Labour Law (Decree-Law 33/2021) and its Executive Regulation, ' +
    'the Wage Protection System, labour complaints and disputes, end-of-service and its alternative savings scheme, ' +
    'work injuries, safety and labour accommodation, unemployment insurance, human trafficking, and the separate ' +
    "Domestic Workers law with its regulation. Call this before stating any legal rule. Use the law's own words: " +
    '"wage" for salary, "official documents" for a passport, "end-of-service gratuity", "warning period" for notice, ' +
    '"the Ministry" for MOHRE. Search again with other words if the articles do not answer the question. ' +
    'Returns the most relevant articles with their reference.';
  readonly inputSchema = inputSchema;

  constructor(private readonly knowledge: KnowledgeService) {}

  async execute({ query }: z.infer<typeof inputSchema>): Promise<ToolOutput> {
    const matches = await this.knowledge.search(query);
    if (matches.length === 0) {
      return {
        result: {
          found: false,
          instruction: 'No article matches. Tell the worker you are not sure and to call MOHRE on 600590000.',
        },
      };
    }

    const articles = matches.map(({ article }) => ({
      reference: article.reference,
      title: article.title,
      text:
        article.body.length > ARTICLE_TEXT_LIMIT
          ? `${article.body.slice(0, ARTICLE_TEXT_LIMIT)} … [article continues]`
          : article.body,
      verified: article.verified,
    }));
    return { result: { found: true, articles }, citations: articles.map((article) => article.reference) };
  }
}
