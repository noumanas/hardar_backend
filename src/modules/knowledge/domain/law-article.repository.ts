import type { LawArticle, LawTopic } from './law-article.entity.js';

export type LawArticleData = Pick<LawArticle, 'reference' | 'title' | 'body' | 'topic'> &
  Partial<Pick<LawArticle, 'sourceUrl' | 'verified'>>;

export interface LawArticleFilter {
  topic?: LawTopic;
  verified?: boolean;
}

export interface ArticleMatch {
  article: LawArticle;
  /** Postgres `ts_rank`; higher is more relevant. */
  rank: number;
}

/** Persistence port for the labour-law knowledge base. */
export abstract class LawArticleRepository {
  abstract search(query: string, limit: number): Promise<ArticleMatch[]>;
  abstract findById(id: string): Promise<LawArticle | null>;
  abstract list(skip: number, take: number, filter?: LawArticleFilter): Promise<{ items: LawArticle[]; total: number }>;
  abstract create(data: LawArticleData): Promise<LawArticle>;
  abstract save(article: LawArticle): Promise<LawArticle>;
  abstract delete(id: string): Promise<boolean>;
  abstract countVerification(): Promise<{ total: number; verified: number }>;
}
