import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import { LawArticle } from '../domain/law-article.entity.js';
import {
  LawArticleRepository,
  type ArticleMatch,
  type LawArticleData,
  type LawArticleFilter,
} from '../domain/law-article.repository.js';

/**
 * Ranks articles that share any normalised word with the query. The query's lexemes are
 * OR-ed (each quoted, so user text can never break the tsquery syntax), then `ts_rank`
 * orders them. Natural questions match even when not every word appears in the article.
 */
const SEARCH_SQL = `
  WITH q AS (
    SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' | ')) AS query
    FROM unnest(tsvector_to_array(to_tsvector('english', $1))) AS lexeme
  )
  SELECT a.id, ts_rank(a.search_vector, q.query) AS rank
  FROM law_articles a, q
  WHERE q.query IS NOT NULL AND a.search_vector @@ q.query
  ORDER BY rank DESC, a.reference ASC
  LIMIT $2`;

@Injectable()
export class TypeOrmLawArticleRepository implements LawArticleRepository {
  constructor(@InjectRepository(LawArticle) private readonly articles: Repository<LawArticle>) {}

  async search(query: string, limit: number): Promise<ArticleMatch[]> {
    const hits: { id: string; rank: number }[] = await this.articles.query(SEARCH_SQL, [query, limit]);
    if (hits.length === 0) return [];

    const articles = await this.articles.findBy({ id: In(hits.map((hit) => hit.id)) });
    const byId = new Map(articles.map((article) => [article.id, article]));
    return hits.flatMap((hit) => {
      const article = byId.get(hit.id);
      return article ? [{ article, rank: Number(hit.rank) }] : [];
    });
  }

  findById(id: string): Promise<LawArticle | null> {
    return this.articles.findOneBy({ id });
  }

  async list(
    skip: number,
    take: number,
    filter: LawArticleFilter = {},
  ): Promise<{ items: LawArticle[]; total: number }> {
    const { topic, verified } = filter;
    const [items, total] = await this.articles.findAndCount({
      where: { ...(topic ? { topic } : {}), ...(verified === undefined ? {} : { verified }) },
      order: { topic: 'ASC', reference: 'ASC' },
      skip,
      take,
    });
    return { items, total };
  }

  async create(data: LawArticleData): Promise<LawArticle> {
    const { id } = await this.articles.save(this.articles.create(data));
    return this.reload(id);
  }

  async save(article: LawArticle): Promise<LawArticle> {
    await this.articles.save(article);
    return this.reload(article.id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.articles.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  /**
   * TypeORM reloads generated columns after a write, which would put the internal
   * `search_vector` on the returned entity; a fresh read honours `select: false`.
   */
  private reload(id: string): Promise<LawArticle> {
    return this.articles.findOneByOrFail({ id });
  }

  async countVerification(): Promise<{ total: number; verified: number }> {
    const [total, verified] = await Promise.all([this.articles.count(), this.articles.countBy({ verified: true })]);
    return { total, verified };
  }
}
