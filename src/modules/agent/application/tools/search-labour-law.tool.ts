import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { KnowledgeService } from '../../../knowledge/application/knowledge.service.js';
import type { AgentTool, ToolOutput } from '../../domain/agent-tool.js';

const inputSchema = z.strictObject({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe('The legal question as short English keywords, e.g. "overtime pay night rate"'),
});

/** FR-7: retrieval over the official knowledge base; the only source the agent may answer from. */
@Injectable()
export class SearchLabourLawTool implements AgentTool<typeof inputSchema> {
  readonly name = 'search_labour_law';
  readonly description =
    'Search the UAE labour law knowledge base (Decree-Law 33/2021 and MOHRE guides). ' +
    'Call this before stating any legal rule. Returns the most relevant articles with their reference.';
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
      text: article.body,
      verified: article.verified,
    }));
    return { result: { found: true, articles }, citations: articles.map((article) => article.reference) };
  }
}
