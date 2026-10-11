import { Injectable, NotFoundException } from '@nestjs/common';

import { PageMetaDto, type Page } from '../../../common/dto/pagination.dto.js';
import type { LawArticle } from '../domain/law-article.entity.js';
import {
  LawArticleRepository,
  type ArticleMatch,
  type LawArticleData,
  type LawArticleFilter,
} from '../domain/law-article.repository.js';

export const DEFAULT_SEARCH_LIMIT = 4;
export const MAX_SEARCH_LIMIT = 10;

@Injectable()
export class KnowledgeService {
  constructor(private readonly articles: LawArticleRepository) {}

  /** Retrieval for FR-7: the most relevant official rules for a question. */
  search(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<ArticleMatch[]> {
    const trimmed = query.trim();
    if (!trimmed) return Promise.resolve([]);
    return this.articles.search(trimmed, Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT));
  }

  async list(page: number, limit: number, filter: LawArticleFilter = {}): Promise<Page<LawArticle>> {
    const { items, total } = await this.articles.list((page - 1) * limit, limit, filter);
    return { items, meta: PageMetaDto.of(page, limit, total) };
  }

  async get(id: string): Promise<LawArticle> {
    const article = await this.articles.findById(id);
    if (!article) throw new NotFoundException(`Law article ${id} not found`);
    return article;
  }

  create(data: LawArticleData): Promise<LawArticle> {
    return this.articles.create(data);
  }

  async update(id: string, changes: Partial<LawArticleData>): Promise<LawArticle> {
    const article = await this.get(id);
    return this.articles.save(Object.assign(article, changes));
  }

  verificationStatus(): Promise<{ total: number; verified: number }> {
    return this.articles.countVerification();
  }

  async remove(id: string): Promise<void> {
    if (!(await this.articles.delete(id))) throw new NotFoundException(`Law article ${id} not found`);
  }
}
